import React, { useState, useEffect, useCallback } from "react";
import "./App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [connectionForm, setConnectionForm] = useState({
    host: '',
    port: 21,
    username: '',
    password: ''
  });
  const [files, setFiles] = useState([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [dragActive, setDragActive] = useState(false);

  // Show message helper
  const showMessage = (text, type = 'info') => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  };

  // Connect to FTP server
  const connectToFTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await fetch(`${API}/ftp/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(connectionForm),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setIsConnected(true);
        setSessionId(data.session_id);
        showMessage('Connected successfully!', 'success');
        await listFiles();
      } else {
        showMessage(`Connection failed: ${data.detail}`, 'error');
      }
    } catch (error) {
      showMessage(`Connection error: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Disconnect from FTP server
  const disconnectFromFTP = async () => {
    if (!sessionId) return;
    
    try {
      await fetch(`${API}/ftp/disconnect/${sessionId}`, {
        method: 'POST',
      });
      
      setIsConnected(false);
      setSessionId(null);
      setFiles([]);
      setCurrentPath('/');
      showMessage('Disconnected successfully!', 'success');
    } catch (error) {
      showMessage(`Disconnect error: ${error.message}`, 'error');
    }
  };

  // List files in current directory
  const listFiles = useCallback(async (path = null) => {
    if (!sessionId) return;
    
    setLoading(true);
    try {
      const url = path ? `${API}/ftp/list/${sessionId}?path=${encodeURIComponent(path)}` : `${API}/ftp/list/${sessionId}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (response.ok) {
        setFiles(data.files);
        setCurrentPath(data.current_path);
      } else {
        showMessage(`Failed to list files: ${data.detail}`, 'error');
      }
    } catch (error) {
      showMessage(`Error listing files: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Change directory
  const changeDirectory = async (path) => {
    if (!sessionId) return;
    
    try {
      const formData = new FormData();
      formData.append('path', path);
      
      const response = await fetch(`${API}/ftp/change-directory/${sessionId}`, {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (response.ok) {
        await listFiles();
        showMessage(data.message, 'success');
      } else {
        showMessage(`Failed to change directory: ${data.message}`, 'error');
      }
    } catch (error) {
      showMessage(`Error changing directory: ${error.message}`, 'error');
    }
  };

  // Upload file
  const uploadFile = async (file) => {
    if (!sessionId) return;
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API}/ftp/upload/${sessionId}`, {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (response.ok) {
        showMessage(data.message, 'success');
        await listFiles(); // Refresh file list
      } else {
        showMessage(`Upload failed: ${data.detail}`, 'error');
      }
    } catch (error) {
      showMessage(`Upload error: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Download file
  const downloadFile = async (filename) => {
    if (!sessionId) return;
    
    try {
      const response = await fetch(`${API}/ftp/download/${sessionId}/${encodeURIComponent(filename)}`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showMessage(`Downloaded: ${filename}`, 'success');
      } else {
        const data = await response.json();
        showMessage(`Download failed: ${data.detail}`, 'error');
      }
    } catch (error) {
      showMessage(`Download error: ${error.message}`, 'error');
    }
  };

  // Handle drag events
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  // Handle drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  }, []);

  // Handle file input
  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-800 mb-2">FTP Client</h1>
              <p className="text-gray-600">Connect to your FTP server</p>
            </div>

            {message && (
              <div className={`mb-6 p-4 rounded-lg ${
                messageType === 'error' ? 'bg-red-100 text-red-700 border border-red-200' :
                messageType === 'success' ? 'bg-green-100 text-green-700 border border-green-200' :
                'bg-blue-100 text-blue-700 border border-blue-200'
              }`}>
                {message}
              </div>
            )}

            <form onSubmit={connectToFTP} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  FTP Server Host
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="ftp.example.com"
                  value={connectionForm.host}
                  onChange={(e) => setConnectionForm({...connectionForm, host: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Port
                </label>
                <input
                  type="number"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={connectionForm.port}
                  onChange={(e) => setConnectionForm({...connectionForm, port: parseInt(e.target.value)})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={connectionForm.username}
                  onChange={(e) => setConnectionForm({...connectionForm, username: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={connectionForm.password}
                  onChange={(e) => setConnectionForm({...connectionForm, password: e.target.value})}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Connecting...' : 'Connect'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">FTP Client</h1>
              <p className="text-gray-600">Connected to {connectionForm.host}</p>
              <p className="text-sm text-gray-500">Current Path: {currentPath}</p>
            </div>
            <button
              onClick={disconnectFromFTP}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            messageType === 'error' ? 'bg-red-100 text-red-700 border border-red-200' :
            messageType === 'success' ? 'bg-green-100 text-green-700 border border-green-200' :
            'bg-blue-100 text-blue-700 border border-blue-200'
          }`}>
            {message}
          </div>
        )}

        {/* Upload Area */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Upload Files</h2>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="space-y-4">
              <div className="text-4xl text-gray-400">📁</div>
              <div>
                <p className="text-lg font-medium text-gray-700">
                  Drag and drop files here
                </p>
                <p className="text-gray-500">or</p>
                <label className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
                  Choose Files
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileInput}
                    multiple
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* File Browser */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Files & Directories</h2>
            <div className="space-x-2">
              {currentPath !== '/' && (
                <button
                  onClick={() => changeDirectory('..')}
                  className="bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700 transition-colors"
                >
                  ↑ Up
                </button>
              )}
              <button
                onClick={() => listFiles()}
                disabled={loading}
                className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Name</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Type</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Size</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Modified</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-8 text-gray-500">
                      {loading ? 'Loading...' : 'No files found'}
                    </td>
                  </tr>
                ) : (
                  files.map((file, index) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center">
                          <span className="mr-2">
                            {file.type === 'directory' ? '📁' : '📄'}
                          </span>
                          {file.name}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600 capitalize">
                        {file.type}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {file.size ? `${(file.size / 1024).toFixed(1)} KB` : '-'}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {file.modified || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-x-2">
                          {file.type === 'directory' ? (
                            <button
                              onClick={() => changeDirectory(file.name)}
                              className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
                            >
                              Open
                            </button>
                          ) : (
                            <button
                              onClick={() => downloadFile(file.name)}
                              className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
                            >
                              Download
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;