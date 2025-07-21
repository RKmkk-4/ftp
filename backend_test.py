#!/usr/bin/env python3
"""
Backend API Testing for FTP Client Application
Tests all FTP-related endpoints and functionality
"""

import requests
import json
import io
import os
import time
from typing import Dict, Any

# Backend URL from frontend/.env
BACKEND_URL = "https://d8822d01-6f7c-48c9-a080-abe5d44fb987.preview.emergentagent.com/api"

# Test FTP server credentials (using public test FTP server)
TEST_FTP_CONFIG = {
    "host": "test.rebex.net",
    "port": 21,
    "username": "demo",
    "password": "password"
}

class FTPClientTester:
    def __init__(self):
        self.session_id = None
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, message: str, details: Dict[Any, Any] = None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "details": details or {}
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name} - {message}")
        if details:
            print(f"   Details: {details}")
    
    def test_ftp_connection(self):
        """Test FTP connection endpoint"""
        print("\n=== Testing FTP Connection Management ===")
        
        # Test successful connection
        try:
            response = requests.post(
                f"{BACKEND_URL}/ftp/connect",
                json=TEST_FTP_CONFIG,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success" and data.get("session_id"):
                    self.session_id = data["session_id"]
                    self.log_test(
                        "FTP Connection - Valid Credentials",
                        True,
                        f"Successfully connected to {TEST_FTP_CONFIG['host']}",
                        {"session_id": self.session_id, "response": data}
                    )
                else:
                    self.log_test(
                        "FTP Connection - Valid Credentials",
                        False,
                        "Invalid response format",
                        {"response": data}
                    )
            else:
                self.log_test(
                    "FTP Connection - Valid Credentials",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    {"status_code": response.status_code}
                )
        except Exception as e:
            self.log_test(
                "FTP Connection - Valid Credentials",
                False,
                f"Connection error: {str(e)}"
            )
        
        # Test invalid credentials
        try:
            invalid_config = TEST_FTP_CONFIG.copy()
            invalid_config["password"] = "wrongpassword"
            
            response = requests.post(
                f"{BACKEND_URL}/ftp/connect",
                json=invalid_config,
                timeout=30
            )
            
            if response.status_code == 400:
                self.log_test(
                    "FTP Connection - Invalid Credentials",
                    True,
                    "Correctly rejected invalid credentials",
                    {"status_code": response.status_code}
                )
            else:
                self.log_test(
                    "FTP Connection - Invalid Credentials",
                    False,
                    f"Should have returned 400, got {response.status_code}",
                    {"status_code": response.status_code, "response": response.text}
                )
        except Exception as e:
            self.log_test(
                "FTP Connection - Invalid Credentials",
                False,
                f"Error testing invalid credentials: {str(e)}"
            )
    
    def test_file_listing(self):
        """Test file listing endpoint"""
        print("\n=== Testing FTP File Listing ===")
        
        if not self.session_id:
            self.log_test("FTP File Listing", False, "No active session")
            return
        
        try:
            response = requests.get(
                f"{BACKEND_URL}/ftp/list/{self.session_id}",
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success" and "files" in data:
                    files = data["files"]
                    current_path = data.get("current_path", "/")
                    
                    self.log_test(
                        "FTP File Listing",
                        True,
                        f"Listed {len(files)} items in {current_path}",
                        {
                            "file_count": len(files),
                            "current_path": current_path,
                            "sample_files": files[:3] if files else []
                        }
                    )
                else:
                    self.log_test(
                        "FTP File Listing",
                        False,
                        "Invalid response format",
                        {"response": data}
                    )
            else:
                self.log_test(
                    "FTP File Listing",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    {"status_code": response.status_code}
                )
        except Exception as e:
            self.log_test(
                "FTP File Listing",
                False,
                f"Error listing files: {str(e)}"
            )
    
    def test_file_upload(self):
        """Test file upload endpoint"""
        print("\n=== Testing FTP File Upload ===")
        
        if not self.session_id:
            self.log_test("FTP File Upload", False, "No active session")
            return
        
        # Create a test file
        test_content = "This is a test file for FTP upload functionality.\nCreated by backend_test.py"
        test_filename = f"test_upload_{int(time.time())}.txt"
        
        try:
            files = {
                'file': (test_filename, io.StringIO(test_content), 'text/plain')
            }
            
            response = requests.post(
                f"{BACKEND_URL}/ftp/upload/{self.session_id}",
                files=files,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success":
                    self.log_test(
                        "FTP File Upload",
                        True,
                        f"Successfully uploaded {test_filename}",
                        {"filename": test_filename, "response": data}
                    )
                else:
                    self.log_test(
                        "FTP File Upload",
                        False,
                        "Upload failed - invalid response",
                        {"response": data}
                    )
            else:
                self.log_test(
                    "FTP File Upload",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    {"status_code": response.status_code}
                )
        except Exception as e:
            self.log_test(
                "FTP File Upload",
                False,
                f"Error uploading file: {str(e)}"
            )
    
    def test_file_download(self):
        """Test file download endpoint"""
        print("\n=== Testing FTP File Download ===")
        
        if not self.session_id:
            self.log_test("FTP File Download", False, "No active session")
            return
        
        # First, get list of files to find one to download
        try:
            list_response = requests.get(
                f"{BACKEND_URL}/ftp/list/{self.session_id}",
                timeout=30
            )
            
            if list_response.status_code != 200:
                self.log_test("FTP File Download", False, "Could not get file list for download test")
                return
            
            files_data = list_response.json()
            files = files_data.get("files", [])
            
            # Find a file (not directory) to download
            download_file = None
            for file_info in files:
                if file_info.get("type") == "file":
                    download_file = file_info["name"]
                    break
            
            if not download_file:
                self.log_test(
                    "FTP File Download",
                    True,
                    "No files available for download test (this is acceptable)",
                    {"available_files": len(files)}
                )
                return
            
            # Test downloading the file
            response = requests.get(
                f"{BACKEND_URL}/ftp/download/{self.session_id}/{download_file}",
                timeout=30
            )
            
            if response.status_code == 200:
                content_length = len(response.content)
                content_type = response.headers.get('content-type', 'unknown')
                
                self.log_test(
                    "FTP File Download",
                    True,
                    f"Successfully downloaded {download_file}",
                    {
                        "filename": download_file,
                        "content_length": content_length,
                        "content_type": content_type
                    }
                )
            else:
                self.log_test(
                    "FTP File Download",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    {"filename": download_file, "status_code": response.status_code}
                )
                
        except Exception as e:
            self.log_test(
                "FTP File Download",
                False,
                f"Error downloading file: {str(e)}"
            )
    
    def test_directory_navigation(self):
        """Test directory navigation endpoint"""
        print("\n=== Testing FTP Directory Navigation ===")
        
        if not self.session_id:
            self.log_test("FTP Directory Navigation", False, "No active session")
            return
        
        # First get current directory listing to find a subdirectory
        try:
            list_response = requests.get(
                f"{BACKEND_URL}/ftp/list/{self.session_id}",
                timeout=30
            )
            
            if list_response.status_code != 200:
                self.log_test("FTP Directory Navigation", False, "Could not get directory list")
                return
            
            files_data = list_response.json()
            files = files_data.get("files", [])
            current_path = files_data.get("current_path", "/")
            
            # Find a directory to navigate to
            target_dir = None
            for file_info in files:
                if file_info.get("type") == "directory":
                    target_dir = file_info["name"]
                    break
            
            if target_dir:
                # Test changing to subdirectory
                response = requests.post(
                    f"{BACKEND_URL}/ftp/change-directory/{self.session_id}",
                    data={"path": target_dir},
                    timeout=30
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("status") == "success":
                        self.log_test(
                            "FTP Directory Navigation - Change to Subdirectory",
                            True,
                            f"Successfully changed to directory: {target_dir}",
                            {"target_directory": target_dir, "response": data}
                        )
                        
                        # Test going back up
                        back_response = requests.post(
                            f"{BACKEND_URL}/ftp/change-directory/{self.session_id}",
                            data={"path": ".."},
                            timeout=30
                        )
                        
                        if back_response.status_code == 200:
                            back_data = back_response.json()
                            if back_data.get("status") == "success":
                                self.log_test(
                                    "FTP Directory Navigation - Go Back",
                                    True,
                                    "Successfully navigated back to parent directory",
                                    {"response": back_data}
                                )
                            else:
                                self.log_test(
                                    "FTP Directory Navigation - Go Back",
                                    False,
                                    "Failed to go back to parent directory",
                                    {"response": back_data}
                                )
                        else:
                            self.log_test(
                                "FTP Directory Navigation - Go Back",
                                False,
                                f"HTTP {back_response.status_code}: {back_response.text}"
                            )
                    else:
                        self.log_test(
                            "FTP Directory Navigation - Change to Subdirectory",
                            False,
                            "Directory change failed",
                            {"response": data}
                        )
                else:
                    self.log_test(
                        "FTP Directory Navigation - Change to Subdirectory",
                        False,
                        f"HTTP {response.status_code}: {response.text}"
                    )
            else:
                self.log_test(
                    "FTP Directory Navigation",
                    True,
                    "No subdirectories available for navigation test (this is acceptable)",
                    {"current_path": current_path, "available_items": len(files)}
                )
                
        except Exception as e:
            self.log_test(
                "FTP Directory Navigation",
                False,
                f"Error testing directory navigation: {str(e)}"
            )
    
    def test_ftp_disconnect(self):
        """Test FTP disconnection endpoint"""
        print("\n=== Testing FTP Disconnection ===")
        
        if not self.session_id:
            self.log_test("FTP Disconnection", False, "No active session")
            return
        
        try:
            response = requests.post(
                f"{BACKEND_URL}/ftp/disconnect/{self.session_id}",
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success":
                    self.log_test(
                        "FTP Disconnection",
                        True,
                        "Successfully disconnected from FTP server",
                        {"session_id": self.session_id, "response": data}
                    )
                    self.session_id = None  # Clear session
                else:
                    self.log_test(
                        "FTP Disconnection",
                        False,
                        "Disconnection failed",
                        {"response": data}
                    )
            else:
                self.log_test(
                    "FTP Disconnection",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    {"status_code": response.status_code}
                )
        except Exception as e:
            self.log_test(
                "FTP Disconnection",
                False,
                f"Error disconnecting: {str(e)}"
            )
    
    def test_basic_api_health(self):
        """Test basic API health"""
        print("\n=== Testing Basic API Health ===")
        
        try:
            response = requests.get(f"{BACKEND_URL}/", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.log_test(
                    "API Health Check",
                    True,
                    "API is responding correctly",
                    {"response": data}
                )
            else:
                self.log_test(
                    "API Health Check",
                    False,
                    f"HTTP {response.status_code}: {response.text}"
                )
        except Exception as e:
            self.log_test(
                "API Health Check",
                False,
                f"API health check failed: {str(e)}"
            )
    
    def run_all_tests(self):
        """Run all FTP client tests"""
        print("🚀 Starting FTP Client Backend API Tests")
        print(f"Backend URL: {BACKEND_URL}")
        print(f"Test FTP Server: {TEST_FTP_CONFIG['host']}:{TEST_FTP_CONFIG['port']}")
        
        # Run tests in logical order
        self.test_basic_api_health()
        self.test_ftp_connection()
        self.test_file_listing()
        self.test_file_upload()
        self.test_file_download()
        self.test_directory_navigation()
        self.test_ftp_disconnect()
        
        # Summary
        print("\n" + "="*60)
        print("📊 TEST SUMMARY")
        print("="*60)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        print("\n📋 DETAILED RESULTS:")
        for result in self.test_results:
            status = "✅" if result["success"] else "❌"
            print(f"{status} {result['test']}: {result['message']}")
        
        # Return results for programmatic use
        return {
            "total": total,
            "passed": passed,
            "failed": total - passed,
            "success_rate": (passed/total)*100,
            "results": self.test_results
        }

def main():
    """Main test execution"""
    tester = FTPClientTester()
    results = tester.run_all_tests()
    
    # Exit with appropriate code
    if results["failed"] > 0:
        print(f"\n❌ {results['failed']} tests failed")
        exit(1)
    else:
        print(f"\n✅ All {results['passed']} tests passed!")
        exit(0)

if __name__ == "__main__":
    main()