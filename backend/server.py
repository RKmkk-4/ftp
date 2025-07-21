from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import ftplib
import io
import tempfile
from concurrent.futures import ThreadPoolExecutor
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Thread pool for FTP operations
executor = ThreadPoolExecutor(max_workers=10)

# FTP sessions storage (in production, use Redis or database)
ftp_sessions = {}

# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

class FTPConnectionRequest(BaseModel):
    host: str
    port: int = 21
    username: str
    password: str

class FTPConnectionResponse(BaseModel):
    session_id: str
    status: str
    message: str

class FTPFileInfo(BaseModel):
    name: str
    type: str  # 'file' or 'directory'
    size: Optional[int] = None
    modified: Optional[str] = None

class FTPListResponse(BaseModel):
    files: List[FTPFileInfo]
    current_path: str
    status: str

class FTPOperationResponse(BaseModel):
    status: str
    message: str

# FTP Client Manager
class FTPClientManager:
    def __init__(self):
        self.connections = {}
    
    def connect(self, session_id: str, host: str, port: int, username: str, password: str) -> tuple:
        try:
            ftp = ftplib.FTP()
            ftp.connect(host, port)
            ftp.login(username, password)
            ftp.set_pasv(True)  # Use passive mode
            
            self.connections[session_id] = {
                'ftp': ftp,
                'current_path': '/',
                'host': host,
                'username': username
            }
            
            return True, f"Successfully connected to {host}"
        except Exception as e:
            return False, f"Connection failed: {str(e)}"
    
    def disconnect(self, session_id: str) -> tuple:
        try:
            if session_id in self.connections:
                self.connections[session_id]['ftp'].quit()
                del self.connections[session_id]
                return True, "Disconnected successfully"
            else:
                return False, "No active connection found"
        except Exception as e:
            return True, f"Disconnected (with error): {str(e)}"
    
    def list_files(self, session_id: str, path: str = None) -> tuple:
        try:
            if session_id not in self.connections:
                return False, "No active FTP connection", []
            
            ftp = self.connections[session_id]['ftp']
            
            if path:
                try:
                    ftp.cwd(path)
                    self.connections[session_id]['current_path'] = ftp.pwd()
                except:
                    pass  # If path change fails, stay in current directory
            
            current_path = ftp.pwd()
            self.connections[session_id]['current_path'] = current_path
            
            # Get detailed file listing
            files = []
            file_list = []
            ftp.retrlines('LIST', file_list.append)
            
            for line in file_list:
                parts = line.split()
                if len(parts) >= 9:
                    permissions = parts[0]
                    size = parts[4] if parts[4].isdigit() else 0
                    name = ' '.join(parts[8:])
                    
                    # Skip . and .. entries
                    if name in ['.', '..']:
                        continue
                    
                    file_type = 'directory' if permissions.startswith('d') else 'file'
                    
                    files.append(FTPFileInfo(
                        name=name,
                        type=file_type,
                        size=int(size) if file_type == 'file' else None,
                        modified=' '.join(parts[5:8])
                    ))
            
            return True, "Files listed successfully", files, current_path
        except Exception as e:
            return False, f"Failed to list files: {str(e)}", [], "/"
    
    def download_file(self, session_id: str, filename: str) -> tuple:
        try:
            if session_id not in self.connections:
                return False, "No active FTP connection", None
            
            ftp = self.connections[session_id]['ftp']
            
            # Create a BytesIO buffer to store file data
            file_buffer = io.BytesIO()
            
            # Download file to buffer
            ftp.retrbinary(f'RETR {filename}', file_buffer.write)
            file_buffer.seek(0)
            
            return True, "File downloaded successfully", file_buffer
        except Exception as e:
            return False, f"Failed to download file: {str(e)}", None
    
    def upload_file(self, session_id: str, filename: str, file_data: bytes) -> tuple:
        try:
            if session_id not in self.connections:
                return False, "No active FTP connection"
            
            ftp = self.connections[session_id]['ftp']
            
            # Create BytesIO from file data
            file_buffer = io.BytesIO(file_data)
            
            # Upload file
            ftp.storbinary(f'STOR {filename}', file_buffer)
            
            return True, f"File '{filename}' uploaded successfully"
        except Exception as e:
            return False, f"Failed to upload file: {str(e)}"
    
    def change_directory(self, session_id: str, path: str) -> tuple:
        try:
            if session_id not in self.connections:
                return False, "No active FTP connection"
            
            ftp = self.connections[session_id]['ftp']
            
            if path == "..":
                # Go up one directory
                current = ftp.pwd()
                if current != "/":
                    parts = current.rstrip('/').split('/')
                    if len(parts) > 1:
                        new_path = '/'.join(parts[:-1]) or '/'
                        ftp.cwd(new_path)
            else:
                ftp.cwd(path)
            
            new_path = ftp.pwd()
            self.connections[session_id]['current_path'] = new_path
            
            return True, f"Changed directory to {new_path}"
        except Exception as e:
            return False, f"Failed to change directory: {str(e)}"

# Create FTP manager instance
ftp_manager = FTPClientManager()

# Original routes
@api_router.get("/")
async def root():
    return {"message": "FTP Client API"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# FTP API Routes
@api_router.post("/ftp/connect", response_model=FTPConnectionResponse)
async def connect_ftp(connection_request: FTPConnectionRequest):
    """Connect to an FTP server"""
    session_id = str(uuid.uuid4())
    
    # Run FTP connection in thread pool to avoid blocking
    loop = asyncio.get_event_loop()
    success, message = await loop.run_in_executor(
        executor, 
        ftp_manager.connect,
        session_id,
        connection_request.host,
        connection_request.port,
        connection_request.username,
        connection_request.password
    )
    
    if success:
        return FTPConnectionResponse(
            session_id=session_id,
            status="success",
            message=message
        )
    else:
        raise HTTPException(status_code=400, detail=message)

@api_router.post("/ftp/disconnect/{session_id}", response_model=FTPOperationResponse)
async def disconnect_ftp(session_id: str):
    """Disconnect from FTP server"""
    loop = asyncio.get_event_loop()
    success, message = await loop.run_in_executor(
        executor, 
        ftp_manager.disconnect,
        session_id
    )
    
    return FTPOperationResponse(status="success" if success else "error", message=message)

@api_router.get("/ftp/list/{session_id}", response_model=FTPListResponse)
async def list_ftp_files(session_id: str, path: str = None):
    """List files and directories on FTP server"""
    loop = asyncio.get_event_loop()
    success, message, files, current_path = await loop.run_in_executor(
        executor, 
        ftp_manager.list_files,
        session_id,
        path
    )
    
    if success:
        return FTPListResponse(
            files=files,
            current_path=current_path,
            status="success"
        )
    else:
        raise HTTPException(status_code=400, detail=message)

@api_router.post("/ftp/upload/{session_id}")
async def upload_file_to_ftp(session_id: str, file: UploadFile = File(...)):
    """Upload a file to FTP server"""
    try:
        # Read file data
        file_data = await file.read()
        
        # Upload file using thread pool
        loop = asyncio.get_event_loop()
        success, message = await loop.run_in_executor(
            executor,
            ftp_manager.upload_file,
            session_id,
            file.filename,
            file_data
        )
        
        if success:
            return FTPOperationResponse(status="success", message=message)
        else:
            raise HTTPException(status_code=400, detail=message)
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@api_router.get("/ftp/download/{session_id}/{filename}")
async def download_file_from_ftp(session_id: str, filename: str):
    """Download a file from FTP server"""
    loop = asyncio.get_event_loop()
    success, message, file_buffer = await loop.run_in_executor(
        executor,
        ftp_manager.download_file,
        session_id,
        filename
    )
    
    if success and file_buffer:
        def generate():
            file_buffer.seek(0)
            while True:
                chunk = file_buffer.read(8192)  # Read in 8KB chunks
                if not chunk:
                    break
                yield chunk
        
        return StreamingResponse(
            generate(),
            media_type='application/octet-stream',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'}
        )
    else:
        raise HTTPException(status_code=400, detail=message)

@api_router.post("/ftp/change-directory/{session_id}")
async def change_ftp_directory(session_id: str, path: str = Form(...)):
    """Change current directory on FTP server"""
    loop = asyncio.get_event_loop()
    success, message = await loop.run_in_executor(
        executor,
        ftp_manager.change_directory,
        session_id,
        path
    )
    
    return FTPOperationResponse(status="success" if success else "error", message=message)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    # Close all FTP connections
    for session_id in list(ftp_manager.connections.keys()):
        try:
            ftp_manager.disconnect(session_id)
        except:
            pass
    client.close()