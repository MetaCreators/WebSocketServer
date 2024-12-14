import express from 'express'
import {WebSocket, WebSocketServer } from 'ws'
import { User } from './types/Usertypes'
import { broadcastChatMessage, broadcastUserList, broadcastUserMove } from './helperfns/Sockets'
import { CreateNewUser } from './helperfns/UserRelated/CreateNewUser'
import checkProximity from './helperfns/ProximityCheck/checkProximity'
import http from 'http';
import { config } from './Video/config'
import { Socket } from 'socket.io'
//import { Socket } from 'socket.io'
const socketIO = require('socket.io');
const mediasoup = require('mediasoup');
//const socketIo = new Socket();

let worker :any;
let videoServer:any;
let socketServer;
let expressApp;
let producer:any;
let consumer:any;
let producerTransport:any;
let consumerTransport:any;
let mediasoupRouter:any;

const app = express()
const httpServer = app.listen(8080, () => {
    console.log("websocket server started on port 8080")
})

const wss = new WebSocketServer({ server: httpServer,path:'/chat' });

let connectedUsers: Map<number, User> = new Map();

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
 

async function runWebServer() {
  videoServer = http.createServer(app);
  videoServer.on('error', (err:any) => {
    console.error('starting videoServer failed:', err.message);
  });

  await new Promise<void>((resolve) => {
    const { listenIp, listenPort } = config;
    videoServer.listen(listenPort, listenIp, () => {
      const listenIps = config.mediasoup.webRtcTransport.listenIps[0];
      const ip = listenIps.announcedIp || listenIps.ip;
      console.log('server is running');
      console.log(`open https://${ip}:${listenPort} in your web browser`);
      resolve();
    });
  });
}

async function runSocketServer() {
  socketServer = socketIO(videoServer, {
    serveClient: false,
    path: '/server',
    log: false,
  });

  socketServer.on('connection', (socket:any) => {
    console.log('client connected');

    // inform the client about existence of producer
    if (producer) {
      socket.emit('newProducer');
    }

    socket.on('disconnect', () => {
      console.log('client disconnected');
    });

    socket.on('connect_error', (err: any) => {
      console.error('client connection error', err);
    });

    socket.on('getRouterRtpCapabilities', (data:any, callback:any) => {
      callback(mediasoupRouter.rtpCapabilities);
    });

    socket.on('createProducerTransport', async (data:any, callback:any) => {
      try {
        const { transport, params } = await createWebRtcTransport();
        producerTransport = transport;
        callback(params);
      } catch (err:any) {
        console.error(err);
        callback({ error: err.message });
      }
    });

    socket.on('createConsumerTransport', async (data:any, callback:any) => {
      try {
        const { transport, params } = await createWebRtcTransport();
        consumerTransport = transport;
        callback(params);
      } catch (err:any) {
        console.error(err);
        callback({ error: err.message });
      }
    });

    socket.on('connectProducerTransport', async (data:any, callback:any) => {
      await producerTransport.connect({ dtlsParameters: data.dtlsParameters });
      callback();
    });

    socket.on('connectConsumerTransport', async (data:any, callback:any) => {
      await consumerTransport.connect({ dtlsParameters: data.dtlsParameters });
      callback();
    });

    socket.on('produce', async (data:any, callback:any) => {
      const {kind, rtpParameters} = data;
      producer = await producerTransport.produce({ kind, rtpParameters });
      callback({ id: producer.id });

      // inform clients about new producer
      socket.broadcast.emit('newProducer');
    });

    socket.on('consume', async (data:any, callback:any) => {
      callback(await createConsumer(producer, data.rtpCapabilities));
    });

    socket.on('resume', async (data:any, callback:any) => {
      await consumer.resume();
      callback();
    });
  });
}

async function runMediasoupWorker() {
  worker = await mediasoup.createWorker({
    logLevel: config.mediasoup.worker.logLevel,
    //logTags: config.mediasoup.worker.logTags,
    rtcMinPort: config.mediasoup.worker.rtcMinPort,
    rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
  });

  worker.on('died', () => {
    console.error('mediasoup worker died, exiting in 2 seconds... [pid:%d]', worker.pid);
    setTimeout(() => process.exit(1), 2000);
  });

  const mediaCodecs = config.mediasoup.router.mediaCodecs;
  mediasoupRouter = await worker.createRouter({ mediaCodecs });
}

async function createWebRtcTransport() {
  const {
    maxIncomingBitrate,
    initialAvailableOutgoingBitrate
  } = config.mediasoup.webRtcTransport;

  const transport = await mediasoupRouter.createWebRtcTransport({
    listenIps: config.mediasoup.webRtcTransport.listenIps,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate,
  });
  if (maxIncomingBitrate) {
    try {
      await transport.setMaxIncomingBitrate(maxIncomingBitrate);
    } catch (error) {
    }
  }
  return {
    transport,
    params: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    },
  };
}

async function createConsumer(producer:any, rtpCapabilities:any) {
  if (!mediasoupRouter.canConsume(
    {
      producerId: producer.id,
      rtpCapabilities,
    })
  ) {
    console.error('can not consume');
    return;
  }
  try {
    consumer = await consumerTransport.consume({
      producerId: producer.id,
      rtpCapabilities,
      paused: producer.kind === 'video',
    });
  } catch (error) {
    console.error('consume failed', error);
    return;
  }

  if (consumer.type === 'simulcast') {
    await consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 2 });
  }

  return {
    producerId: producer.id,
    id: consumer.id,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
    type: consumer.type,
    producerPaused: consumer.producerPaused
  };
}