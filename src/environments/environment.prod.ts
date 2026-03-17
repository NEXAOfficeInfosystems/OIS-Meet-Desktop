export const environment = {
  production: true,
  secretkey: 'ce6834aa-049f-46a8-806c-fb36cdf22d84',
  // aiApiBaseUrl: 'http://20.64.87.203',
  aiApiBaseUrl: 'https://ai.nexaois.com:4433',

  // Dev environment
  // apiBaseUrl: 'https://www.nexaois.com/OISMeetAPI_DEV/api',
  // ssoApiBaseUrl: 'https://www.nexaois.com/OIS_SSO_API_Dev/api',
  // signalRUrl: 'https://www.nexaois.com/OISMeetAPI_DEV/hubs',

  // QA environment
  apiBaseUrl: 'https://www.nexaois.com/OISMeetAPI_QA/api',
  ssoApiBaseUrl: 'https://www.nexaois.com/OIS_SSO_API_QA/api',
  signalRUrl: 'https://www.nexaois.com/OISMeetAPI_QA/hubs',

  livekitEnabled: true,
  livekitUrl: 'wss://ois-meet-3nnqexmr.livekit.cloud',

  //Live environment
  // apiBaseUrl: 'https://www.nexaois.com/OISMeetAPI_LIVE/api',
  // ssoApiBaseUrl: 'https://www.officeinfosystems.com/OISSSOAPI/api',
  // signalRUrl: 'https://www.nexaois.com/OISMeetAPI_LIVE/hubs'

  // local environment
  // apiBaseUrl: 'https://localhost:7235/api',
  // ssoApiBaseUrl: 'https://www.nexaois.com/OIS_SSO_API_Dev/api',
  // signalRUrl: 'https://localhost:7235/hubs',

  // WebRTC
  // Note: Many corporate/mobile networks require a TURN server to relay media.
  // Add your TURN server(s) here when available.
  webrtcTrickleIce: true,
  webrtcIceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};
