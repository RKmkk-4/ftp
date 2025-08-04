from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import FTPHandler
from pyftpdlib.servers import FTPServer
import os

# Répertoire FTP racine à partager (à adapter selon ton projet)
ftp_directory = r"D:\RAMIKA\BOS\COURS M1\PROJETM1_res"

# Créer un utilisateur FTP
authorizer = DummyAuthorizer()
authorizer.add_user("ftpuser", "1234", ftp_directory, perm="elradfmw")  # tout accès

# Configuration du handler FTP
handler = FTPHandler
handler.authorizer = authorizer

# Lancer le serveur sur le port 21 (si disponible)
address = ("127.0.0.1", 2121)
server = FTPServer(address, handler)

print(f"FTP Server en marche sur ftp://{address[0]}:{address[1]}")
print(f"Répertoire partagé : {ftp_directory}")
server.serve_forever()
