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
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameFile, setRenameFile] = useState({ oldName: '', newName: '' });
  const [showCreateDirModal, setShowCreateDirModal] = useState(false);
  const [newDirectoryName, setNewDirectoryName] = useState('');

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
        showMessage('Connexion réussie ! 🎉', 'success');
        await listFiles();
      } else {
        showMessage(`Échec de la connexion: ${data.detail}`, 'error');
      }
    } catch (error) {
      showMessage(`Erreur de connexion: ${error.message}`, 'error');
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
      showMessage('Déconnecté avec succès !', 'success');
    } catch (error) {
      showMessage(`Erreur de déconnexion: ${error.message}`, 'error');
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
        showMessage(`Échec du listage des fichiers: ${data.detail}`, 'error');
      }
    } catch (error) {
      showMessage(`Erreur lors du listage: ${error.message}`, 'error');
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
        showMessage(`Échec du changement de répertoire: ${data.message}`, 'error');
      }
    } catch (error) {
      showMessage(`Erreur lors du changement de répertoire: ${error.message}`, 'error');
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
        showMessage(`Échec de l'upload: ${data.detail}`, 'error');
      }
    } catch (error) {
      showMessage(`Erreur d'upload: ${error.message}`, 'error');
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
        showMessage(`Téléchargé: ${filename}`, 'success');
      } else {
        const data = await response.json();
        showMessage(`Échec du téléchargement: ${data.detail}`, 'error');
      }
    } catch (error) {
      showMessage(`Erreur de téléchargement: ${error.message}`, 'error');
    }
  };

  // Delete file
  const deleteFile = async (filename) => {
    if (!sessionId) return;
    
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer "${filename}" ?`)) {
      return;
    }
    
    try {
      const response = await fetch(`${API}/ftp/delete/${sessionId}/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (response.ok) {
        showMessage(data.message, 'success');
        await listFiles(); // Refresh file list
      } else {
        showMessage(`Échec de la suppression: ${data.message}`, 'error');
      }
    } catch (error) {
      showMessage(`Erreur de suppression: ${error.message}`, 'error');
    }
  };

  // Rename file
  const handleRename = async () => {
    if (!sessionId || !renameFile.oldName || !renameFile.newName) return;
    
    try {
      const response = await fetch(`${API}/ftp/rename/${sessionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          old_name: renameFile.oldName,
          new_name: renameFile.newName
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        showMessage(data.message, 'success');
        setShowRenameModal(false);
        setRenameFile({ oldName: '', newName: '' });
        await listFiles(); // Refresh file list
      } else {
        showMessage(`Échec du renommage: ${data.message}`, 'error');
      }
    } catch (error) {
      showMessage(`Erreur de renommage: ${error.message}`, 'error');
    }
  };

  // Create directory
  const createDirectory = async () => {
    if (!sessionId || !newDirectoryName) return;
    
    try {
      const response = await fetch(`${API}/ftp/create-directory/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          directory_name: newDirectoryName
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        showMessage(data.message, 'success');
        setShowCreateDirModal(false);
        setNewDirectoryName('');
        await listFiles(); // Refresh file list
      } else {
        showMessage(`Échec de la création: ${data.message}`, 'error');
      }
    } catch (error) {
      showMessage(`Erreur de création: ${error.message}`, 'error');
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
      <div className="dark-theme min-h-screen p-6">
        <div className="max-w-md mx-auto">
          <div className="glass-card p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">Client FTP</h1>
              <p className="text-gray-300">Connectez-vous à votre serveur FTP</p>
            </div>

            {message && (
              <div className={`mb-6 p-4 rounded-lg border ${
                messageType === 'error' ? 'bg-red-900/30 text-red-300 border-red-500/30' :
                messageType === 'success' ? 'bg-green-900/30 text-green-300 border-green-500/30' :
                'bg-blue-900/30 text-blue-300 border-blue-500/30'
              }`}>
                {message}
              </div>
            )}

            <form onSubmit={connectToFTP} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Serveur FTP
                </label>
                <input
                  type="text"
                  required
                  className="dark-input w-full"
                  placeholder="ftp.exemple.com"
                  value={connectionForm.host}
                  onChange={(e) => setConnectionForm({...connectionForm, host: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Port
                </label>
                <input
                  type="number"
                  required
                  className="dark-input w-full"
                  value={connectionForm.port}
                  onChange={(e) => setConnectionForm({...connectionForm, port: parseInt(e.target.value)})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nom d'utilisateur
                </label>
                <input
                  type="text"
                  required
                  className="dark-input w-full"
                  value={connectionForm.username}
                  onChange={(e) => setConnectionForm({...connectionForm, username: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Mot de passe
                </label>
                <input
                  type="password"
                  required
                  className="dark-input w-full"
                  value={connectionForm.password}
                  onChange={(e) => setConnectionForm({...connectionForm, password: e.target.value})}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="purple-btn w-full"
              >
                {loading ? 'Connexion...' : 'Se connecter'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dark-theme min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="glass-card p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-white">Client FTP</h1>
              <p className="text-gray-300">Connecté à {connectionForm.host}</p>
              <p className="text-sm text-gray-400">Répertoire: {currentPath}</p>
            </div>
            <button
              onClick={disconnectFromFTP}
              className="red-btn"
            >
              Déconnecter
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg border ${
            messageType === 'error' ? 'bg-red-900/30 text-red-300 border-red-500/30' :
            messageType === 'success' ? 'bg-green-900/30 text-green-300 border-green-500/30' :
            'bg-blue-900/30 text-blue-300 border-blue-500/30'
          }`}>
            {message}
          </div>
        )}

        {/* Upload Area */}
        <div className="glass-card p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">📤 Uploader des fichiers</h2>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 ${
              dragActive 
                ? 'border-purple-400 bg-purple-900/20' 
                : 'border-gray-600 hover:border-gray-500 hover:bg-gray-800/20'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="space-y-4">
              <div className="text-4xl">📁</div>
              <div>
                <p className="text-lg font-medium text-white">
                  Glissez-déposez vos fichiers ici
                </p>
                <p className="text-gray-400">ou</p>
                <label className="purple-btn cursor-pointer">
                  Choisir des fichiers
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

        {/* Actions Bar */}
        <div className="glass-card p-4 mb-6">
          <div className="flex justify-between items-center">
            <div className="flex space-x-3">
              {currentPath !== '/' && (
                <button
                  onClick={() => changeDirectory('..')}
                  className="gray-btn"
                >
                  ↑ Remonter
                </button>
              )}
              <button
                onClick={() => listFiles()}
                disabled={loading}
                className="blue-btn"
              >
                {loading ? 'Chargement...' : '🔄 Actualiser'}
              </button>
            </div>
            <button
              onClick={() => setShowCreateDirModal(true)}
              className="green-btn"
            >
              📁+ Nouveau dossier
            </button>
          </div>
        </div>

        {/* File Browser */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-semibold text-white mb-6">📂 Fichiers & Répertoires</h2>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-4 px-4 font-medium text-gray-300">Nom</th>
                  <th className="text-left py-4 px-4 font-medium text-gray-300">Type</th>
                  <th className="text-left py-4 px-4 font-medium text-gray-300">Taille</th>
                  <th className="text-left py-4 px-4 font-medium text-gray-300">Modifié</th>
                  <th className="text-left py-4 px-4 font-medium text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-12 text-gray-400">
                      {loading ? 'Chargement...' : 'Aucun fichier trouvé'}
                    </td>
                  </tr>
                ) : (
                  files.map((file, index) => (
                    <tr key={index} className="border-b border-gray-800 hover:bg-gray-800/30 transition-colors">
                      <td className="py-4 px-4">
                        <div className="flex items-center text-white">
                          <span className="mr-3 text-xl">
                            {file.type === 'directory' ? '📁' : '📄'}
                          </span>
                          {file.name}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-gray-300 capitalize">
                        {file.type === 'directory' ? 'Dossier' : 'Fichier'}
                      </td>
                      <td className="py-4 px-4 text-gray-300">
                        {file.size ? `${(file.size / 1024).toFixed(1)} KB` : '-'}
                      </td>
                      <td className="py-4 px-4 text-gray-300">
                        {file.modified || '-'}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex space-x-2">
                          {file.type === 'directory' ? (
                            <button
                              onClick={() => changeDirectory(file.name)}
                              className="small-green-btn"
                            >
                              Ouvrir
                            </button>
                          ) : (
                            <button
                              onClick={() => downloadFile(file.name)}
                              className="small-blue-btn"
                            >
                              ⬇️ Télécharger
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setRenameFile({ oldName: file.name, newName: file.name });
                              setShowRenameModal(true);
                            }}
                            className="small-yellow-btn"
                          >
                            ✏️ Renommer
                          </button>
                          <button
                            onClick={() => deleteFile(file.name)}
                            className="small-red-btn"
                          >
                            🗑️ Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rename Modal */}
        {showRenameModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3 className="text-xl font-bold text-white mb-4">Renommer</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Ancien nom:</label>
                  <input
                    type="text"
                    value={renameFile.oldName}
                    className="dark-input w-full"
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Nouveau nom:</label>
                  <input
                    type="text"
                    value={renameFile.newName}
                    onChange={(e) => setRenameFile({ ...renameFile, newName: e.target.value })}
                    className="dark-input w-full"
                  />
                </div>
                <div className="flex space-x-3">
                  <button onClick={handleRename} className="purple-btn">
                    Confirmer
                  </button>
                  <button onClick={() => setShowRenameModal(false)} className="gray-btn">
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Directory Modal */}
        {showCreateDirModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3 className="text-xl font-bold text-white mb-4">Créer un dossier</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Nom du dossier:</label>
                  <input
                    type="text"
                    value={newDirectoryName}
                    onChange={(e) => setNewDirectoryName(e.target.value)}
                    className="dark-input w-full"
                    placeholder="nom-du-dossier"
                  />
                </div>
                <div className="flex space-x-3">
                  <button onClick={createDirectory} className="green-btn">
                    Créer
                  </button>
                  <button onClick={() => setShowCreateDirModal(false)} className="gray-btn">
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;