export const ETHERTYPE = {
  ETHERTYPE_IPV4: 0x0800,
  ETHERTYPE_ARP: 0x0806,
  ETHERTYPE_IPV6: 0x86dd,
};

export const IPV4_PROTO = {
  IPV4_PROTO_ICMP: 1,
  IPV4_PROTO_TCP: 6,
  IPV4_PROTO_UDP: 17,
};

export interface EthernetHeader {
  ethertype: number;
  dest: Uint8Array;
  src: Uint8Array;
}

export interface IPv4Header {
  version: number;
  ihl: number;
  tos: number;
  len: number;
  ttl: number;
  proto: number;
  ip_checksum: number;
  src: Uint8Array;
  dest: Uint8Array;
}

export interface TCPHeader {
  sport: number;
  dport: number;
  seq: number;
  ackn: number;
  doff: number;
  winsize: number;
  checksum: number;
  urgent: number;
  fin: boolean;
  syn: boolean;
  rst: boolean;
  psh: boolean;
  ack: boolean;
  urg: boolean;
  ece: boolean;
  cwr: boolean;
}

export interface UDPHeader {
  sport: number;
  dport: number;
  len: number;
  checksum: number;
  data: Uint8Array;
}

export interface ICMPHeader {
  type: number;
  code: number;
  checksum: number;
  data: Uint8Array;
}

export interface ARPHeader {
  htype: number;
  ptype: number;
  oper: number;
  sha: Uint8Array;
  spa: Uint8Array;
  tha: Uint8Array;
  tpa: Uint8Array;
}

export interface DNSHeader {
  id: number;
  flags: number;
  questions: {
    name: string[];
    type: number;
    class: number;
  }[];
  answers: Array<{
    name: string[];
    type: number;
    class: number;
    ttl: number;
    data: Uint8Array;
  }>;
}

export interface DHCPHeader {
  op: number;
  htype: number;
  hlen: number;
  hops: number;
  xid: number;
  secs: number;
  flags: number;
  ciaddr: number;
  yiaddr: number;
  siaddr: number;
  giaddr: number;
  chaddr: Uint8Array;
  magic: number;
  options: Uint8Array[];
}

export interface NTPHeader {
  flags: number;
  stratum: number;
  poll: number;
  precision: number;
  root_delay: number;
  root_disp: number;
  ref_id: number;
  ref_ts_i: number;
  ref_ts_f: number;
  ori_ts_i: number;
  ori_ts_f: number;
  rec_ts_i: number;
  rec_ts_f: number;
  trans_ts_i: number;
  trans_ts_f: number;
}

export interface Packet {
  eth: EthernetHeader;
  ipv4?: IPv4Header;
  tcp?: TCPHeader;
  udp?: UDPHeader;
  icmp?: ICMPHeader;
  arp?: ARPHeader;
  dns?: DNSHeader;
  dhcp?: DHCPHeader;
  ntp?: NTPHeader;
  tcp_data?: Uint8Array;
  dhcp_options?: Uint8Array[];
}
