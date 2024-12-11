import express from 'express'
import WebSocket, { WebSocketServer } from 'ws'

const app = express()
const httpServer = app.listen(8080, () => {
    console.log("websocket server started on port 8080")
})

const wss = new WebSocketServer({ server: httpServer });

interface User {
  id: number
  ws: WebSocket
  position: {
    x: number,
    y: number
  }
}

let connectedUsers: Map<number, User> = new Map();

wss.on('connection', function connection(ws) {
  const userId = connectedUsers.size;

  const newUser: User = {
    id: userId,
    ws: ws,
    position: {
      x: 0,
      y: 0
    }
  };

  connectedUsers.set(userId, newUser);

  ws.send(JSON.stringify({ 
    type: 'userId', 
    id: userId 
  }));

  broadcastUserList();

  ws.on('message', function message(data) {
    try {
      const parsedMessage = JSON.parse(data.toString());

      switch (parsedMessage.type) {
        case 'move':
          const user = connectedUsers.get(userId);
          if (user) {
            user.position = parsedMessage.position;
            broadcastUserMove(userId, user.position);
          }
          break;
        
        case 'chat':
          broadcastChatMessage(userId, parsedMessage.message);
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', function close() {
    connectedUsers.delete(userId);
    broadcastUserList();
  });
});

function broadcastUserList() {
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

function broadcastUserMove(userId: number, position: { x: number, y: number }) {
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
function broadcastChatMessage(userId: number, message: string) {
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