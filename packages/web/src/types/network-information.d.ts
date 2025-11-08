// TypeScript declarations for Network Information API
// https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API

interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

interface Navigator {
  connection?: NetworkInformation;
}
