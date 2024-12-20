import express from 'express'
import {WebSocket, WebSocketServer } from 'ws'
import { User } from './types/Usertypes'
import { broadcastChatMessage, broadcastUserList, broadcastUserMove } from './helperfns/Sockets'
import { CreateNewUser } from './helperfns/UserRelated/CreateNewUser'
import checkProximity from './helperfns/ProximityCheck/checkProximity'
//import http from 'http';
import https from 'httpolyglot';
import { createServer } from 'http'
import { config } from './Video/config';
import { Server } from 'socket.io';
import * as mediasoup from 'mediasoup';
import cors from 'cors';
import fs from 'fs'
import path from 'path';

const options = {
  key: fs.readFileSync(path.join(__dirname, 'ssl/localhost-key.pem'), 'utf-8'),
  cert: fs.readFileSync(path.join(__dirname, 'ssl/localhost.pem'), 'utf-8'),
};

const app = express();
app.use(cors());

app.get('/', (req,res) => {
  res.send('hello from lithouse Backend')
})
const httpsServer = https.createServer(options, app);
//const httpsServer = createServer(app);

const wss = new WebSocketServer({ server: httpsServer, path: '/chat' });
const io = new Server(httpsServer, {
   cors: {
    origin: "http://localhost:5173",
     methods: ["GET", "POST"],
    credentials:true
  },
  //transports: ['websocket', 'polling']
   
});
//const peers = io.of('/mediasoup')


let worker:any;
let router: any;
let producerTransport: any;
let consumerTransport: any;
let producer: any;
let consumer: any;


async function createWorker() {
  worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort:2020
  })
  console.log(`worker pid: ${worker.pid}`);

  worker.on('died', (err: any) => {
    console.log('mediasoup worker died')
    setTimeout(()=>process.exit(1),2000)
  })

  return worker;
}

worker = createWorker();

const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels:2
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate':1000,
    }
  }
]


io.on('connection', async (socket) => {
  console.log("user connected with id " + socket.id);
  socket.broadcast.emit("new-user","new user joined with id "+socket.id)
  socket.on('connect_error', (error) => {
    console.log('Connection error:', error);
  });

  socket.emit('connection-success', {
    socketId:socket.id
  })
  socket.emit("hello","welcome to server")
  socket.on('disconnect', () => {
      console.log('A user disconnected with userid '+socket.id);
  });

  router = await worker.createRouter({ mediaCodecs });

  socket.on('getRtpCapabilities', (callback) => {
    const rtpCapabilities = router.rtpCapabilities;
    console.log('rtpCapabilities: ', rtpCapabilities);
    callback({ rtpCapabilities });
  });

  socket.on('createWebRtcTransport', async ({ sender },callback) => {
    console.log(`sender request? ${sender}`);
    if (sender) {
      producerTransport = await createWebRtcTransport(callback)
    } else {
      consumerTransport = await createWebRtcTransport(callback)
    }
  })
  socket.on('transport-connect', async ({dtlsParameters }: any) => {
    console.log(`dtls params for producer ${dtlsParameters}`);
    await producerTransport.connect({dtlsParameters}) 
  })

  socket.on('transport-produce', async ({kind, rtpParameters,appData }: any,callback) => {
    producer = await producerTransport.produce({ kind, rtpParameters });

    console.log('Producer created:', producer.id, producer.kind);
    
    producer.on('transportclose', () => {
      console.log('transport for this producer is closed')
      producer.close();
    })

    callback({
      id:producer.id
    })
  })

  //some error here because dtls params for consumer is not getting logged,this event is not being triggered at all
  socket.on('transport-recv-connect', async ({ dtlsParameters }: any, callback) => {
    console.log("transport-recv-connect called")
    try {
      console.log(`dtls params for consumer ${dtlsParameters}`);
      await consumerTransport.connect({dtlsParameters}) 
    // callback({
    //   id:producer.id
    // })
    } catch (error: any) {
      console.log('error in transport-recv-connect: ',error)
    }
   
  })

  socket.on('consume', async ({ rtpCapabilities },callback) => {
    try {
      if (router.canConsume({
        producerId: producer.id,
        rtpCapabilities
      })) {
        consumer = await consumerTransport.consume({
          producerId: producer.id,
          rtpCapabilities,
          paused:true
        })
        consumer.on('transportclose', () => {
          console.log('transport closed from consumer')
          //consumer.close();
        });
        consumer.on('producerclose', () => {
          console.log('producer of consumer closed')
          //consumer.close();
        })

        const params = {
          id: consumer.id,
          producerId: producer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        }

        callback({params})
      }
      
    } catch (error) {
      console.log('error consuming:', error);
      callback({
        params: {
          error:error
        }
      })
    }
  })

  socket.on('consumer-resume', async () => {
    console.log('consumer resume')
    await consumer.resume();
  })

})



let connectedUsers: Map<number, User> = new Map();

//io.listen(4000);

wss.on('connection', function connection(ws) {

  const userId = CreateNewUser(connectedUsers,ws)

  ws.send(JSON.stringify({ 
    type: 'userId', 
    id: userId 
  }));

  broadcastUserList(connectedUsers,wss);

  ws.on('message', function message(data) {
    try {
      const parsedMessage = JSON.parse(data.toString());

      switch (parsedMessage.type) {
        case 'move':
          const user = connectedUsers.get(userId);
          if (user) {
            user.position = parsedMessage.position;
            broadcastUserMove(userId, user.position,wss);
          }
          //proximity check here
          //TODO: We are calculating proximity at every move => results in too many computations => what's a better way to do it ?
          //TODO: Will this approach result in a lag? =>probably yes
          //TODO: BUG: When >2 users => proximity message stops working properly=>doesnt clear away + doesnt showup on some client
          let nearbyUsers = checkProximity(connectedUsers)
          if (nearbyUsers) {
            Object.entries(nearbyUsers).forEach(([userId, nearbyUserIds]) => {
              const currentUser = connectedUsers.get(Number(userId));
              if (currentUser) {
                wss.clients.forEach((client) => {
                  if (client === currentUser.ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                      type: "proximity",
                      nearbyUsers: nearbyUserIds,
                      currentUserId:currentUser.id
                   }))
                 }
               })
              }
            });
          } else {
            connectedUsers.forEach((user, userId) => {
              wss.clients.forEach((client) => {
                  if (client===user.ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                      type: "proximity",
                      nearbyUsers: null,
                      currentUserId:userId
                   }))
                 }
              })
            }) 
          }
          break;
        
        case 'chat':
          broadcastChatMessage(userId, parsedMessage.message,wss);
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', function close() {
    connectedUsers.delete(userId);
    broadcastUserList(connectedUsers,wss);
  });
});

httpsServer.listen(8080, () => {
  console.log('Server is running on http://localhost:8080');
});


const createWebRtcTransport = async (callback:any) => {
  try {

    const webRtcTransport_options = {
      listenIps: [
        {
          ip: '0.0.0.0',
          announcedIp:'127.0.0.1'
        }
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp:true
    }

    let transport = await router.createWebRtcTransport(webRtcTransport_options);
    console.log(`transport id: ${transport.id}`)

    transport.on('dtlsstatechange', (dtlsState:any) => {
      if (dtlsState === 'closed') {
        transport.close()
      }
    })

    transport.on('close', () => {
      console.log('tranport closed')
    })

    callback({
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        
      }
    })

    return transport;
    
  } catch (error) {
    console.log('error creating createWebRtcTransport:', error);
    callback({
      params: {
        error:error
      }
    })
  }
}

