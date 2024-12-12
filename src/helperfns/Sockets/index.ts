import  WebSocket,{ WebSocketServer } from "ws";
import { User } from "../../types/Usertypes";


export function broadcastUserList(connectedUsers:Map<number, User>,wss:WebSocketServer) {
  const userList = Array.from(connectedUsers.values()).map(user => ({
    id: user.id,
    position: user.position
  }));

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'userList',
        users: userList
      }));
    }
  });
}

export function broadcastUserMove(userId: number, position: { x: number, y: number },wss:WebSocketServer) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'userMove',
        userId: userId,
        position: position
      }));
    }
  });
}
//
export function broadcastChatMessage(userId: number, message: string,wss:WebSocketServer) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'chat',
        userId: userId,
        message: message
      }));
    }
  });
}