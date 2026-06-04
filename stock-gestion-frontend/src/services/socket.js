import { io } from 'socket.io-client';

let socketInstance = null;

export const initSocket = (user) => {
  // 1. SÉCURITÉ : Si pas d'utilisateur ou si c'est l'Admin/SuperAdmin, on coupe tout
  if (!user || ['Admin', 'SuperAdmin'].includes(user.role)) {
    if (socketInstance) {
      socketInstance.disconnect();
      socketInstance = null;
    }
    console.log("Compte Admin/SuperAdmin ou déconnecté : Connexion Socket.io ignorée.");
    return null;
  }

  // 2. Si le gérant est déjà connecté, on réutilise le socket existant
  if (socketInstance && socketInstance.connected) return socketInstance;

  // 3. Configuration de la connexion
  const socketUrl = process.env.REACT_APP_SOCKET_URL || 'https://shop.ecash-guinee.com';
  
  socketInstance = io(socketUrl, {
    autoConnect: false, // On garde false pour garder le contrôle manuel
    withCredentials: true,
    // CORRECTION IIS : On autorise le 'polling' (HTTP) en premier. 
    transports: ['polling', 'websocket'], 
    upgrade: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000
  });

  // --- LA SEULE CORRECTION À AJOUTER ---
  // On lance manuellement la connexion ici. Seuls les Gérants et Serveurs l'exécuteront !
  socketInstance.connect();

  socketInstance.on('connect', () => {
    console.log('Connecté au serveur en temps réel avec succès ! ID:', socketInstance.id);
    
    // CRITIQUE : Re-rejoindre les salons à chaque connexion (important après une coupure Wi-Fi)
    const userId = localStorage.getItem('userId');
    const boutiqueId = localStorage.getItem('boutiqueId');
    const userRole = localStorage.getItem('userRole');

    if (userId) socketInstance.emit('join_user_room', userId);
    if (boutiqueId) socketInstance.emit('join_boutique_room', boutiqueId);
    if (['Admin', 'SuperAdmin'].includes(userRole)) socketInstance.emit('join_admin_room');
  });

  socketInstance.on('connect_error', (error) => {
    console.warn('Erreur Socket.io (Le site continue de fonctionner en mode dégradé) :', error.message);
  });

  return socketInstance;
};

// Permet de récupérer l'instance n'importe où dans le code frontend
export const getSocket = () => socketInstance;

// Export d'un wrapper sécurisé pour éviter les plantages "Cannot read properties of null"
const safeSocket = {
    connect: () => socketInstance?.connect(),
    disconnect: () => socketInstance?.disconnect(),
    on: (event, cb) => socketInstance?.on(event, cb),
    off: (event, cb) => socketInstance?.off(event, cb),
    emit: (event, data) => socketInstance?.emit(event, data),
};

export default safeSocket;