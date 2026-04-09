export const environment = {
  production: true,
  secretkey: 'ce6834aa-049f-46a8-806c-fb36cdf22d84',
  aiApiBaseUrl: 'https://ai.nexaois.com:4433',

  // Dev environment
  // apiBaseUrl: 'https://www.nexaois.com/OISMeetAPI_DEV/api',
  // ssoApiBaseUrl: 'https://www.nexaois.com/OIS_SSO_API_Dev/api',
  // signalRUrl: 'https://www.nexaois.com/OISMeetAPI_DEV/hubs',

  // QA environment
  // apiBaseUrl: 'https://www.nexaois.com/OISMeetAPI_QA/api',
  // ssoApiBaseUrl: 'https://www.nexaois.com/OIS_SSO_API_QA/api',
  // signalRUrl: 'https://www.nexaois.com/OISMeetAPI_QA/hubs',

  //Live environment
  // apiBaseUrl: 'https://www.officeinfosystems.com/OISMeetAPI/api',
  // ssoApiBaseUrl: 'https://www.officeinfosystems.com/OISSSOAPI/api',
  // signalRUrl: 'https://www.officeinfosystems.com/OISMeetAPI/hubs',

  // local environment
  apiBaseUrl: 'https://localhost:7235/api',
  ssoApiBaseUrl: 'https://www.officeinfosystems.com/OISSSOAPI/api',
  signalRUrl: 'https://localhost:7235/hubs',

  // WebRTC
  livekitEnabled: true,
  livekitUrl: 'wss://ois-meet-3nnqexmr.livekit.cloud',
  webrtcTrickleIce: true,
  webrtcIceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};
