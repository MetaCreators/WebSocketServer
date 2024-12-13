import WebSocket from 'ws'
export interface User {
  id: number
  ws: WebSocket
  position: {
    x: number,
    y: number
  }
}

export interface CurrUserPosType {
  x: number;
  y: number;
}
