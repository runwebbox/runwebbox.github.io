import {
  type Packet,
  type TCPHeader,
  ETHERTYPE,
  IPV4_PROTO,
} from './packet.js';

const TCP_HEADER_SIZE = 20;
const IPV4_HEADER_SIZE = 20;
//const ETH_HEADER_SIZE = 14;
const ICMP_HEADER_SIZE = 4;

//const TCP_STATE_CLOSED = 'closed';
//const TCP_STATE_LISTEN = 'listen';
const TCP_STATE_SYN_RECEIVED = 'syn-received';
const TCP_STATE_SYN_SENT = 'syn-sent';
const TCP_STATE_ESTABLISHED = 'established';
//const TCP_STATE_FIN_WAIT_1 = 'fin-wait-1';
//const TCP_STATE_FIN_WAIT_2 = 'fin-wait-2';
const TCP_STATE_CLOSE_WAIT = 'close-wait';
//const TCP_STATE_LAST_ACK = 'last-ack';
//const TCP_STATE_CLOSING = 'closing';

const TCP_DYNAMIC_PORT_START = 49152;
const TCP_DYNAMIC_PORT_END = 65535;
const TCP_DYNAMIC_PORT_RANGE = TCP_DYNAMIC_PORT_END - TCP_DYNAMIC_PORT_START;

type TCPState =
  //  | typeof TCP_STATE_CLOSED
  //  | typeof TCP_STATE_LISTEN
  | typeof TCP_STATE_SYN_RECEIVED
  | typeof TCP_STATE_SYN_SENT
  | typeof TCP_STATE_ESTABLISHED
  //  | typeof TCP_STATE_FIN_WAIT_1
  //  | typeof TCP_STATE_FIN_WAIT_2
  | typeof TCP_STATE_CLOSE_WAIT;
//  | typeof TCP_STATE_LAST_ACK
//  | typeof TCP_STATE_CLOSING;

interface TCPConnection {
  state: TCPState;
  localSeq: number;
  remoteSeq: number;
  localAck: number;
  remoteAck: number;
  windowSize: number;
  callback?: (data: Uint8Array) => void;
}

interface ARPEntry {
  ip: Uint8Array;
  mac: Uint8Array;
  timestamp: number;
}

/**
 * Интерфейс для работы с TCP/IP стеком
 * Обрабатывает сетевые пакеты (Ethernet, IPv4, ARP, ICMP, TCP)
 * эмулирует TCP server/client устройство (сетевой пакет <-> TCP пакеты)
 * и предоставляет готовые методы работы с пакетами
 */
export interface ITCPParser {
  /**
   * Обработка входящего сетевого пакета
   * @param packet - сетевой пакет для обработки
   * @remarks
   * Метод автоматически определяет тип пакета (ARP, ICMP, TCP)
   * и вызывает соответствующий обработчик
   */
  handlePacket(packet: Packet, port: number): void;

  /**
   * Установка TCP соединения с удаленным хостом
   * @param remoteIP - IP адрес удаленного хоста (Uint8Array[4])
   * @param remotePort - порт удаленного хоста
   * @returns Promise, который разрешается при успешном установлении соединения, возвращая порт
   * @throws {Error} Если не удалось получить MAC адрес или установить соединение
   * @remarks
   * Метод выполняет трехэтапное рукопожатие TCP:
   * 1. Отправка SYN
   * 2. Получение SYN-ACK
   * 3. Отправка ACK
   */
  connect(remoteIP: Uint8Array, remotePort: number): Promise<number>;

  /**
   * Отправка данных через установленное TCP соединение
   * @param remoteIP - IP адрес удаленного хоста
   * @param remotePort - порт удаленного хоста
   * @param localPort - локальный порт соединения
   * @param data - данные для отправки (Uint8Array)
   * @throws {Error} Если соединение не найдено или не установлено
   * @remarks
   * Метод автоматически инкрементирует sequence number
   * и обновляет состояние соединения
   */
  send(
    remoteIP: Uint8Array,
    remotePort: number,
    localPort: number,
    data: Uint8Array
  ): void;
}

export class TCPParser implements ITCPParser {
  private mac: Uint8Array;
  private ip: Uint8Array;
  private sendPacket: (packet: Packet) => void;
  private openPorts: Set<number>;
  private dataCallback: (
    ip: Uint8Array,
    port: number,
    localPort: number,
    data: Uint8Array,
    EOF: boolean
  ) => void;

  private tcpConnections: Map<string, TCPConnection>;
  private arpTable: Map<string, ARPEntry>;
  private tcpSeq: number;

  constructor(
    mac: Uint8Array,
    ip: Uint8Array,
    sendPacket: (packet: Packet) => void,
    openPorts: number[],
    dataCallback: (
      ip: Uint8Array,
      port: number,
      localPort: number,
      data: Uint8Array,
      EOF: boolean
    ) => void
  ) {
    this.mac = mac;
    this.ip = ip;
    this.sendPacket = sendPacket;
    this.openPorts = new Set(openPorts);
    this.dataCallback = dataCallback;

    this.tcpConnections = new Map();
    this.arpTable = new Map();
    this.tcpSeq = Math.floor(Math.random() * 10000);
  }

  /**
   * Обработка входящего пакета
   */
  public handlePacket(packet: Packet): void {
    // Проверяем, предназначен ли пакет нам
    if (!this.isPacketForMe(packet)) {
      return;
    }

    // Обрабатываем ARP
    if (packet.arp) {
      this.handleARP(packet);
      return;
    }

    // Обрабатываем IPv4
    if (packet.ipv4) {
      // Проверяем, что IP назначения - наш
      if (!this.arraysEqual(packet.ipv4.dest, this.ip)) {
        return;
      }

      // Обрабатываем ICMP
      if (packet.icmp) {
        this.handleICMP(packet);
        return;
      }

      // Обрабатываем TCP
      if (packet.tcp) {
        this.handleTCP(packet);
        return;
      }
    }
  }

  /**
   * Установка TCP соединения
   */
  public async connect(
    remoteIP: Uint8Array,
    remotePort: number
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      // Генерируем локальный порт
      const localPort = this.generateLocalPort();

      // Получаем MAC адрес удаленного хоста
      this.getMacForIP(remoteIP)
        .then(mac => {
          // Создаем соединение
          const connKey = this.getConnectionKey(
            remoteIP,
            remotePort,
            localPort
          );
          const connection: TCPConnection = {
            state: TCP_STATE_SYN_SENT,
            localSeq: this.tcpSeq++,
            remoteSeq: 0,
            localAck: 0,
            remoteAck: 0,
            windowSize: 64240,
          };

          this.tcpConnections.set(connKey, connection);

          // Отправляем SYN
          this.sendTCPPacket(
            mac,
            remoteIP,
            localPort,
            remotePort,
            connection.localSeq,
            0,
            true,
            false,
            false,
            false,
            false,
            connection.windowSize,
            undefined
          );

          // Ждем SYN-ACK (упрощенно, без таймаута)
          const checkConnection = () => {
            const currentConn = this.tcpConnections.get(connKey);
            if (currentConn?.state === TCP_STATE_ESTABLISHED) {
              resolve(localPort);
            } else {
              setTimeout(checkConnection, 100);
            }
          };

          checkConnection();
        })
        .catch(reject);
    });
  }

  /**
   * Отправка данных через TCP
   */
  public send(
    remoteIP: Uint8Array,
    remotePort: number,
    localPort: number,
    data: Uint8Array
  ): void {
    const connKey = this.getConnectionKey(remoteIP, remotePort, localPort);
    if (!connKey) {
      throw new Error('No connection found');
    }

    const connection = this.tcpConnections.get(connKey);
    if (!connection || connection.state !== TCP_STATE_ESTABLISHED) {
      throw new Error('Connection not established');
    }

    // Получаем MAC адрес
    this.getMacForIP(remoteIP).then(mac => {
      // Отправляем данные
      this.sendTCPPacket(
        mac,
        remoteIP,
        parseInt(connKey.split(':')[2]), // localPort из ключа
        remotePort,
        connection.localSeq,
        connection.remoteSeq,
        false,
        true,
        false,
        false,
        false,
        connection.windowSize,
        data
      );

      // Обновляем sequence number
      connection.localSeq += data.length;
    });
  }

  /**
   * Обработка ARP пакетов
   */
  private handleARP(packet: Packet): void {
    if (!packet.arp) return;

    const arp = packet.arp;

    // Добавляем запись в ARP таблицу
    this.addARPEntry(arp.spa, arp.sha);

    // Если это ARP запрос и он для нашего IP
    if (arp.oper === 1 && this.arraysEqual(arp.tpa, this.ip)) {
      // Отправляем ARP ответ
      this.sendARPPacket(
        packet.eth.src, // dest MAC
        arp.spa, // sender IP (запрашивающий)
        this.mac, // наш MAC
        this.ip // наш IP
      );
    }
  }

  /**
   * Обработка ICMP пакетов
   */
  private handleICMP(packet: Packet): void {
    if (!packet.ipv4 || !packet.icmp) return;

    const icmp = packet.icmp;

    // Если это ping запрос (echo request)
    if (icmp.type === 8 && icmp.code === 0) {
      // Отправляем ping ответ (echo reply)
      this.sendICMPPacket(packet.eth.src, packet.ipv4.src, icmp.data);
    }
  }

  /**
   * Обработка TCP пакетов
   */
  private handleTCP(packet: Packet): void {
    if (!packet.ipv4 || !packet.tcp) return;

    const tcp = packet.tcp;
    const remoteIP = packet.ipv4.src;
    const remotePort = tcp.sport;
    const localPort = tcp.dport;

    // Проверяем, открыт ли порт
    if (!this.openPorts.has(localPort) && !this.isDynamicPort(localPort)) {
      // Закрытый порт - отправляем RST
      this.sendTCPPacket(
        packet.eth.src,
        remoteIP,
        localPort,
        remotePort,
        0,
        tcp.seq + (tcp.syn ? 1 : 0),
        false,
        false,
        true,
        false,
        false,
        0,
        undefined
      );
      return;
    }

    const connKey = this.getConnectionKey(remoteIP, remotePort, localPort);
    let connection = this.tcpConnections.get(connKey);

    // Добавляем запись в ARP таблицу
    this.addARPEntry(remoteIP, packet.eth.src);

    // Обработка SYN (начало соединения)
    if (tcp.syn && !tcp.ack) {
      if (connection) {
        // Уже есть соединение - сбрасываем
        this.sendTCPPacket(
          packet.eth.src,
          remoteIP,
          localPort,
          remotePort,
          0,
          tcp.seq + 1,
          false,
          false,
          true,
          false,
          false,
          0,
          undefined
        );
        return;
      }

      // Создаем новое соединение
      connection = {
        state: TCP_STATE_SYN_RECEIVED,
        localSeq: this.tcpSeq++,
        remoteSeq: tcp.seq + 1,
        localAck: tcp.seq + 1,
        remoteAck: 0,
        windowSize: 64240,
      };

      this.tcpConnections.set(connKey, connection);

      // Отправляем SYN-ACK
      this.sendTCPPacket(
        packet.eth.src,
        remoteIP,
        localPort,
        remotePort,
        connection.localSeq,
        connection.localAck,
        true,
        true,
        false,
        false,
        false,
        connection.windowSize,
        undefined
      );

      return;
    }

    // Если соединение не найдено, игнорируем
    if (!connection) {
      return;
    }
    if (connection.state === TCP_STATE_SYN_SENT && tcp.syn && tcp.ack) {
      if (tcp.ackn === connection.localSeq + 1) {
        connection.state = TCP_STATE_ESTABLISHED;
        connection.remoteSeq = tcp.seq + 1; // SYN занимает 1 байт
        connection.remoteAck = tcp.ackn;

        this.sendTCPPacket(
          packet.eth.src,
          remoteIP,
          localPort,
          remotePort,
          connection.localSeq + 1, // Seq = localSeq + 1 (SYN занял 1 байт)
          connection.remoteSeq, // Ack = remoteSeq (уже учтен SYN)
          false, // SYN = false
          true, // ACK = true
          false, // FIN = false
          false, // RST = false
          false, // PSH = false
          connection.windowSize,
          undefined
        );
      } else {
        console.error('Invalid ACK number in SYN-ACK');
      }
    }

    // Обработка ACK на SYN-ACK
    if (tcp.ack && !tcp.syn && connection.state === TCP_STATE_SYN_RECEIVED) {
      if (tcp.ackn === connection.localSeq + 1) {
        connection.state = TCP_STATE_ESTABLISHED;
        connection.remoteAck = tcp.ackn;
      } else {
        console.error('Invalid ACK number');
      }
      return;
    }

    // Обработка данных в установленном соединении
    if (
      connection.state === TCP_STATE_ESTABLISHED &&
      tcp.ack &&
      packet.tcp_data
    ) {
      // Проверяем sequence number
      if (Math.abs(tcp.seq - connection.remoteSeq) < 3) {
        // Отправляем ACK на полученные данные
        this.sendTCPPacket(
          packet.eth.src,
          remoteIP,
          localPort,
          remotePort,
          connection.localSeq,
          connection.remoteSeq + packet.tcp_data.length,
          false,
          true,
          false,
          false,
          false,
          connection.windowSize,
          undefined
        );

        // Обновляем sequence number
        connection.remoteSeq += packet.tcp_data.length;

        // Вызываем callback с данными
        this.dataCallback(
          remoteIP,
          remotePort,
          localPort,
          packet.tcp_data,
          false
        );
      } else {
        console.error('Invalid SEQ number in DATA');
      }
    }

    // Обработка FIN
    if (tcp.fin) {
      if (connection.state === TCP_STATE_ESTABLISHED) {
        connection.state = TCP_STATE_CLOSE_WAIT;

        this.dataCallback(
          remoteIP,
          remotePort,
          localPort,
          new Uint8Array([]),
          true // EOF
        );

        // Отправляем ACK на FIN
        this.sendTCPPacket(
          packet.eth.src,
          remoteIP,
          localPort,
          remotePort,
          connection.localSeq,
          connection.remoteAck + 1,
          false,
          true,
          false,
          false,
          false,
          connection.windowSize,
          undefined
        );

        connection.remoteAck += 1;
      }
    }

    // Обработка RST
    if (tcp.rst) {
      this.dataCallback(
        remoteIP,
        remotePort,
        localPort,
        new Uint8Array([]),
        true // EOF
      );
      this.tcpConnections.delete(connKey);
    }
  }

  /**
   * Отправка ARP пакета
   */
  private sendARPPacket(
    destMAC: Uint8Array,
    destIP: Uint8Array,
    srcMAC: Uint8Array,
    srcIP: Uint8Array,
    operation: number = 2 // 1 = request, 2 = reply
  ): void {
    const packet: Packet = {
      eth: {
        dest: destMAC,
        src: srcMAC,
        ethertype: ETHERTYPE.ETHERTYPE_ARP,
      },
      arp: {
        htype: 1, // Ethernet
        ptype: ETHERTYPE.ETHERTYPE_IPV4,
        oper: operation,
        sha: srcMAC,
        spa: srcIP,
        tha: destMAC,
        tpa: destIP,
      },
    };

    this.sendPacket(packet);
  }

  /**
   * Отправка ICMP пакета (ping reply)
   */
  private sendICMPPacket(
    destMAC: Uint8Array,
    destIP: Uint8Array,
    data: Uint8Array
  ): void {
    const packet: Packet = {
      eth: {
        dest: destMAC,
        src: this.mac,
        ethertype: ETHERTYPE.ETHERTYPE_IPV4,
      },
      ipv4: {
        version: 4,
        ihl: 5,
        tos: 0,
        len: IPV4_HEADER_SIZE + ICMP_HEADER_SIZE + data.length,
        ttl: 64,
        proto: IPV4_PROTO.IPV4_PROTO_ICMP,
        ip_checksum: 0,
        src: this.ip,
        dest: destIP,
        df: false,
        opt: new Uint8Array([]),
      },
      icmp: {
        type: 0, // Echo reply
        code: 0,
        checksum: 0,
        data: data,
      },
    };

    this.sendPacket(packet);
  }

  /**
   * Отправка TCP пакета
   */
  private sendTCPPacket(
    destMAC: Uint8Array,
    destIP: Uint8Array,
    srcPort: number,
    destPort: number,
    seq: number,
    ackn: number,
    syn: boolean,
    ack: boolean,
    rst: boolean,
    fin: boolean,
    psh: boolean,
    windowSize: number,
    data?: Uint8Array
  ): void {
    const tcpHeader: TCPHeader = {
      sport: srcPort,
      dport: destPort,
      seq: seq,
      ackn: ackn,
      doff: 5, // 20 bytes / 4
      winsize: windowSize,
      checksum: 0,
      urgent: 0,
      fin: fin,
      syn: syn,
      rst: rst,
      psh: psh,
      ack: ack,
      urg: false,
      ece: false,
      cwr: false,
      opt: new Uint8Array([]),
    };

    const tcpLength = TCP_HEADER_SIZE + (data ? data.length : 0);
    const totalLength = IPV4_HEADER_SIZE + tcpLength;

    const packet: Packet = {
      eth: {
        dest: destMAC,
        src: this.mac,
        ethertype: ETHERTYPE.ETHERTYPE_IPV4,
      },
      ipv4: {
        version: 4,
        ihl: 5,
        tos: 0,
        len: totalLength,
        ttl: 64,
        proto: IPV4_PROTO.IPV4_PROTO_TCP,
        ip_checksum: 0,
        src: this.ip,
        dest: destIP,
        df: false,
        opt: new Uint8Array([]),
      },
      tcp: tcpHeader,
      tcp_data: data,
    };

    this.sendPacket(packet);
  }

  /**
   * Получение MAC адреса для IP
   */
  private async getMacForIP(ip: Uint8Array): Promise<Uint8Array> {
    const ipKey = this.ipToString(ip);

    // Проверяем ARP таблицу
    const entry = this.arpTable.get(ipKey);
    if (entry && Date.now() - entry.timestamp < 300000) {
      // 5 минут TTL
      return entry.mac;
    }

    // Отправляем ARP запрос
    return new Promise((resolve, reject) => {
      // Широковещательный MAC для ARP запроса
      const broadcastMAC = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

      // Отправляем ARP запрос
      this.sendARPPacket(
        broadcastMAC,
        ip,
        this.mac,
        this.ip,
        1 // ARP request
      );

      // Ждем ответ (упрощенно)
      const checkInterval = setInterval(() => {
        const newEntry = this.arpTable.get(ipKey);
        if (newEntry) {
          clearInterval(checkInterval);
          resolve(newEntry.mac);
        }
      }, 100);

      // Таймаут
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('ARP timeout'));
      }, 5000);
    });
  }

  /**
   * Добавление записи в ARP таблицу
   */
  private addARPEntry(ip: Uint8Array, mac: Uint8Array): void {
    const ipKey = this.ipToString(ip);
    this.arpTable.set(ipKey, {
      ip: ip,
      mac: mac,
      timestamp: Date.now(),
    });
  }

  /**
   * Генерация локального порта
   */
  private generateLocalPort(): number {
    return (
      TCP_DYNAMIC_PORT_START +
      Math.floor(Math.random() * TCP_DYNAMIC_PORT_RANGE)
    );
  }

  /**
   * Проверка, является ли порт динамическим
   */
  private isDynamicPort(port: number): boolean {
    return port >= TCP_DYNAMIC_PORT_START && port <= TCP_DYNAMIC_PORT_END;
  }

  /**
   * Создание ключа соединения
   */
  private getConnectionKey(
    remoteIP: Uint8Array,
    remotePort: number,
    localPort: number
  ): string {
    return `${this.ipToString(remoteIP)}:${remotePort}:${localPort}`;
  }

  /**
   * Проверка, предназначен ли пакет нам
   */
  private isPacketForMe(packet: Packet): boolean {
    // Широковещательный ARP запрос или пакет на наш MAC
    if (
      packet.eth.dest[0] === 0xff &&
      packet.eth.dest[1] === 0xff &&
      packet.eth.dest[2] === 0xff &&
      packet.eth.dest[3] === 0xff &&
      packet.eth.dest[4] === 0xff &&
      packet.eth.dest[5] === 0xff
    ) {
      return true;
    }

    return this.arraysEqual(packet.eth.dest, this.mac);
  }

  /**
   * Сравнение массивов
   */
  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Конвертация IP в строку
   */
  private ipToString(ip: Uint8Array): string {
    return `${ip[0]}.${ip[1]}.${ip[2]}.${ip[3]}`;
  }
}

const ETH_HEADER_SIZE = 14;
const ETHERTYPE_IPV4 = 0x0800;
const ETHERTYPE_ARP = 0x0806;
const ETHERTYPE_IPV6 = 0x86dd;
const IPV4_PROTO_ICMP = 1;
const IPV4_PROTO_TCP = 6;
const IPV4_PROTO_UDP = 17;

function parse_icmp(data: Uint8Array, o: Packet) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const icmp = {
    type: view.getUint8(0),
    code: view.getUint8(1),
    checksum: view.getUint16(2),
    data: data.subarray(4),
  };
  o.icmp = icmp;
}
function parse_tcp(data: Uint8Array, o: Packet) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const flags = view.getUint8(13);
  const tcp: TCPHeader = {
    sport: view.getUint16(0),
    dport: view.getUint16(2),
    seq: view.getUint32(4),
    ackn: view.getUint32(8),
    doff: view.getUint8(12) >> 4,
    winsize: view.getUint16(14),
    checksum: view.getUint16(16),
    urgent: view.getUint16(18),
    fin: !!(flags & 0x01),
    syn: !!(flags & 0x02),
    rst: !!(flags & 0x04),
    psh: !!(flags & 0x08),
    ack: !!(flags & 0x10),
    urg: !!(flags & 0x20),
    ece: !!(flags & 0x40),
    cwr: !!(flags & 0x80),
    opt: data.subarray(20, (view.getUint8(12) >> 4) * 4),
  };

  o.tcp = tcp;

  const offset = tcp.doff * 4;
  //tcp.doff = 5;
  //tcp.opt = new Uint8Array([]);
  o.tcp_data = data.subarray(offset);
}
function parse_dhcp(data: Uint8Array, o: Packet) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  //const bootpo  = data.subarray(44,44+192);
  const dhcp = {
    op: view.getUint8(0),
    htype: view.getUint8(1),
    hlen: view.getUint8(2),
    hops: view.getUint8(3),
    xid: view.getUint32(4),
    secs: view.getUint16(8),
    flags: view.getUint16(10),
    ciaddr: view.getUint32(12),
    yiaddr: view.getUint32(16),
    siaddr: view.getUint32(20),
    giaddr: view.getUint32(24),
    chaddr: data.subarray(28, 28 + 16),
    magic: view.getUint32(236),
    options: [] as Uint8Array[],
  };

  const options = data.subarray(240);
  for (let i = 0; i < options.length; ++i) {
    const start = i;
    const op = options[i];
    if (op === 0) continue;
    ++i;
    const len = options[i];
    i += len;
    dhcp.options.push(options.subarray(start, start + len + 2));
  }

  o.dhcp = dhcp;
  o.dhcp_options = dhcp.options;
}
function parse_dns(data: Uint8Array, o: Packet) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const dns: Packet['dns'] = {
    id: view.getUint16(0),
    flags: view.getUint16(2),
    questions: [],
    answers: [],
  };

  const qdcount = view.getUint16(4);
  const ancount = view.getUint16(6);
  //const nscount = view.getUint16(8);
  //const arcount = view.getUint16(10);

  let offset = 12;
  function read_dstr() {
    const o = [];
    let len;
    do {
      len = view.getUint8(offset);
      o.push(
        new TextDecoder().decode(data.subarray(offset + 1, offset + 1 + len))
      );
      offset += len + 1;
    } while (len > 0);
    return o;
  }

  for (let i = 0; i < qdcount; i++) {
    dns.questions.push({
      name: read_dstr(),
      type: view.getInt16(offset),
      class: view.getInt16(offset + 2),
    });
    offset += 4;
  }
  for (let i = 0; i < ancount; i++) {
    const ans = {
      name: read_dstr(),
      type: view.getInt16(offset),
      class: view.getUint16(offset + 2),
      ttl: view.getUint32(offset + 4),
      data: new Uint8Array() as Uint8Array<ArrayBufferLike>,
    };
    offset += 8;
    const rdlen = view.getUint16(offset);
    offset += 2;
    ans.data = data.subarray(offset, offset + rdlen);
    offset += rdlen;
    dns.answers.push(ans);
  }
  o.dns = dns;
}

function parse_ntp(data: Uint8Array, o: Packet) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  o.ntp = {
    flags: view.getUint8(0),
    stratum: view.getUint8(1),
    poll: view.getUint8(2),
    precision: view.getUint8(3),
    root_delay: view.getUint32(4),
    root_disp: view.getUint32(8),
    ref_id: view.getUint32(12),
    ref_ts_i: view.getUint32(16),
    ref_ts_f: view.getUint32(20),
    ori_ts_i: view.getUint32(24),
    ori_ts_f: view.getUint32(28),
    rec_ts_i: view.getUint32(32),
    rec_ts_f: view.getUint32(36),
    trans_ts_i: view.getUint32(40),
    trans_ts_f: view.getUint32(44),
  };
}

function parse_udp(data: Uint8Array, o: Packet) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const udp = {
    sport: view.getUint16(0),
    dport: view.getUint16(2),
    len: view.getUint16(4),
    checksum: view.getUint16(6),
    data: data.subarray(8),
    data_s: new TextDecoder().decode(data.subarray(8)),
  };

  //dbg_assert(udp.data.length + 8 == udp.len);
  if (udp.dport === 67 || udp.sport === 67) {
    //DHCP
    parse_dhcp(data.subarray(8), o);
  } else if (udp.dport === 53 || udp.sport === 53) {
    parse_dns(data.subarray(8), o);
  } else if (udp.dport === 123) {
    parse_ntp(data.subarray(8), o);
  }
  o.udp = udp;
}

function parse_ipv4(data: Uint8Array, o: Packet): void {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const version = (data[0] >> 4) & 0x0f;
  const ihl = data[0] & 0x0f;

  const tos = view.getUint8(1);
  const len = view.getUint16(2);
  const identification = view.getUint16(4);
  const fragment_offset = view.getUint16(6) & 8191;
  if (fragment_offset != 0)
    console.log(
      `ipv4 fragment_offset: ${identification} or ${fragment_offset} !== 0`
    );

  const ttl = view.getUint8(8);
  const proto = view.getUint8(9);
  const ip_checksum = view.getUint16(10);

  const ipv4 = {
    version,
    ihl,
    tos,
    len: data.length,
    ttl,
    proto,
    ip_checksum,
    df: (view.getUint16(6) & 16384) != 0,
    src: data.subarray(12, 12 + 4),
    dest: data.subarray(16, 16 + 4),
    opt: data.subarray(20, ihl * 4),
  };

  // Ethernet minmum packet size.
  //if (Math.max(len, 46) !== data.length) {
  //  console.log(`ipv4 Length mismatch: ${len} != ${data.length}`);
  //}

  o.ipv4 = ipv4;
  const ipdata = data.subarray(ihl * 4, len);
  if (proto === IPV4_PROTO_ICMP) {
    parse_icmp(ipdata, o);
  } else if (proto === IPV4_PROTO_TCP) {
    parse_tcp(ipdata, o);
    //ipv4.len -= (o.tcp!.doff-5)*4;
  } else if (proto === IPV4_PROTO_UDP) {
    parse_udp(ipdata, o);
  }
}
function parse_arp(data: Uint8Array, o: Packet): void {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // const hlen = data[4];
  // const plen = data[5];

  const arp = {
    htype: view.getUint16(0),
    ptype: view.getUint16(2),
    oper: view.getUint16(6),
    sha: data.subarray(8, 14),
    spa: data.subarray(14, 18),
    tha: data.subarray(18, 24),
    tpa: data.subarray(24, 28),
  };
  o.arp = arp;
}

export function parse_eth(data: Uint8Array): Packet {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const ethertype = view.getUint16(12);
  const eth = {
    ethertype: ethertype,
    dest: data.subarray(0, 6),
    src: data.subarray(6, 12),
  };

  const o: Packet = { eth };

  // TODO: Remove CRC from the end of the packet maybe?
  const payload = data.subarray(ETH_HEADER_SIZE, data.length);

  if (ethertype === ETHERTYPE_IPV4) {
    parse_ipv4(payload, o);
    return o;
  } else if (ethertype === ETHERTYPE_ARP) {
    parse_arp(payload, o);
    return o;
  } else if (ethertype === ETHERTYPE_IPV6) {
    throw 'Unimplemented: ipv6';
  } else {
    throw 'Unknown ethertype: ' + ethertype;
  }
}

// Вспомогательные функции для вычисления контрольных сумм
function calculateChecksum(data: Uint8Array): number {
  let sum = 0;
  let i = 0;

  // Обрабатываем полные 16-битные слова
  while (i + 1 < data.length) {
    sum += (data[i] << 8) | data[i + 1];
    i += 2;

    // Переносим переполнение
    while (sum > 0xffff) {
      sum = (sum & 0xffff) + (sum >> 16);
    }
  }

  // Если остался нечетный байт
  if (i < data.length) {
    sum += data[i] << 8;

    while (sum > 0xffff) {
      sum = (sum & 0xffff) + (sum >> 16);
    }
  }

  return ~sum & 0xffff;
}

function calculateIPChecksum(header: Uint8Array): number {
  // Обнуляем поле контрольной суммы перед вычислением
  const tempHeader = new Uint8Array(header);
  tempHeader[10] = 0;
  tempHeader[11] = 0;

  return calculateChecksum(tempHeader);
}

function calculateTCPChecksum(
  tcpSegment: Uint8Array,
  srcIp: Uint8Array,
  dstIp: Uint8Array
): number {
  // Псевдозаголовок для TCP контрольной суммы
  const pseudoHeader = new Uint8Array(12);

  // IP адреса источника и назначения
  pseudoHeader.set(srcIp, 0);
  pseudoHeader.set(dstIp, 4);

  // Заполняем нулем и протокол (TCP = 6)
  pseudoHeader[8] = 0;
  pseudoHeader[9] = 6; // IPPROTO_TCP

  // Длина TCP сегмента
  const tcpLength = tcpSegment.length;
  pseudoHeader[10] = (tcpLength >> 8) & 0xff;
  pseudoHeader[11] = tcpLength & 0xff;

  // Обнуляем поле контрольной суммы в TCP заголовке
  const tempTcpSegment = new Uint8Array(tcpSegment);
  tempTcpSegment[16] = 0;
  tempTcpSegment[17] = 0;

  // Суммируем псевдозаголовок и TCP сегмент
  const combined = new Uint8Array(pseudoHeader.length + tempTcpSegment.length);
  combined.set(pseudoHeader, 0);
  combined.set(tempTcpSegment, pseudoHeader.length);

  return calculateChecksum(combined);
}

function calculateUDPChecksum(
  udpSegment: Uint8Array,
  srcIp: Uint8Array,
  dstIp: Uint8Array
): number {
  // Псевдозаголовок для UDP контрольной суммы
  const pseudoHeader = new Uint8Array(12);

  // IP адреса источника и назначения
  pseudoHeader.set(srcIp, 0);
  pseudoHeader.set(dstIp, 4);

  // Заполняем нулем и протокол (UDP = 17)
  pseudoHeader[8] = 0;
  pseudoHeader[9] = 17; // IPPROTO_UDP

  // Длина UDP сегмента
  const udpLength = udpSegment.length;
  pseudoHeader[10] = (udpLength >> 8) & 0xff;
  pseudoHeader[11] = udpLength & 0xff;

  // Обнуляем поле контрольной суммы в UDP заголовке
  const tempUdpSegment = new Uint8Array(udpSegment);
  tempUdpSegment[6] = 0;
  tempUdpSegment[7] = 0;

  // Суммируем псевдозаголовок и UDP сегмент
  const combined = new Uint8Array(pseudoHeader.length + tempUdpSegment.length);
  combined.set(pseudoHeader, 0);
  combined.set(tempUdpSegment, pseudoHeader.length);

  return calculateChecksum(combined);
}

// Обновленные функции с контрольными суммами

function build_icmp(icmp: Packet['icmp']): Uint8Array {
  if (!icmp) throw new Error('ICMP data required');

  const data = icmp.data || new Uint8Array(0);
  const buffer = new ArrayBuffer(4 + data.byteLength);
  const view = new DataView(buffer);

  // Записываем заголовок с нулевой контрольной суммой
  view.setUint8(0, icmp.type);
  view.setUint8(1, icmp.code);
  view.setUint16(2, 0); // Временная контрольная сумма (0 для вычисления)

  const result = new Uint8Array(buffer);
  result.set(data, 4);

  // Вычисляем контрольную сумму
  const checksum = calculateChecksum(result);
  view.setUint16(2, checksum);

  return result;
}

function build_tcp(
  tcp: Packet['tcp'],
  tcp_data?: Uint8Array,
  srcIp?: Uint8Array,
  dstIp?: Uint8Array
): Uint8Array {
  if (!tcp) throw new Error('TCP data required');

  const data = tcp_data || new Uint8Array(0);
  const doff = tcp.doff || 5;
  const buffer = new ArrayBuffer(doff * 4 + data.byteLength);
  const view = new DataView(buffer);

  // Записываем TCP заголовок
  view.setUint16(0, tcp.sport);
  view.setUint16(2, tcp.dport);
  view.setUint32(4, tcp.seq);
  view.setUint32(8, tcp.ackn || 0);
  view.setUint8(12, (doff << 4) | 0);

  let flags = 0;
  if (tcp.fin) flags |= 0x01;
  if (tcp.syn) flags |= 0x02;
  if (tcp.rst) flags |= 0x04;
  if (tcp.psh) flags |= 0x08;
  if (tcp.ack) flags |= 0x10;
  if (tcp.urg) flags |= 0x20;
  if (tcp.ece) flags |= 0x40;
  if (tcp.cwr) flags |= 0x80;
  view.setUint8(13, flags);

  view.setUint16(14, tcp.winsize || 65535);
  view.setUint16(16, 0); // Временная контрольная сумма
  view.setUint16(18, tcp.urgent || 0);

  const result = new Uint8Array(buffer);
  result.set(tcp.opt, 20);
  result.set(data, doff * 4);

  // Вычисляем контрольную сумму если предоставлены IP адреса
  if (srcIp && dstIp && (!tcp.checksum || tcp.checksum === 0)) {
    const checksum = calculateTCPChecksum(result, srcIp, dstIp);
    view.setUint16(16, checksum);
  } else if (tcp.checksum) {
    view.setUint16(16, tcp.checksum);
  }

  return result;
}

function build_dhcp(dhcp: Packet['dhcp']): Uint8Array {
  if (!dhcp) throw new Error('DHCP data required');

  const options = dhcp.options || [];
  const optionsLength = options.reduce((sum, opt) => sum + opt.length, 0);
  const buffer = new ArrayBuffer(240 + optionsLength);
  const view = new DataView(buffer);
  const result = new Uint8Array(buffer);

  view.setUint8(0, dhcp.op);
  view.setUint8(1, dhcp.htype);
  view.setUint8(2, dhcp.hlen);
  view.setUint8(3, dhcp.hops);
  view.setUint32(4, dhcp.xid);
  view.setUint16(8, dhcp.secs);
  view.setUint16(10, dhcp.flags);
  view.setUint32(12, dhcp.ciaddr || 0);
  view.setUint32(16, dhcp.yiaddr || 0);
  view.setUint32(20, dhcp.siaddr || 0);
  view.setUint32(24, dhcp.giaddr || 0);

  if (dhcp.chaddr) {
    result.set(dhcp.chaddr.subarray(0, 16), 28);
  }

  // Pad remaining chaddr bytes with 0
  for (let i = 28 + (dhcp.chaddr?.length || 0); i < 44; i++) {
    result[i] = 0;
  }

  view.setUint32(236, dhcp.magic || 0x63538263);

  let offset = 240;
  options.forEach(opt => {
    result.set(opt, offset);
    offset += opt.length;
  });

  return result;
}

function build_dns(dns: Packet['dns']): Uint8Array {
  if (!dns) throw new Error('DNS data required');

  // First pass: calculate total size
  let totalSize = 12; // Fixed header size

  function calculateNameSize(name: string[]): number {
    return name.reduce((sum, part) => sum + 1 + part.length, 1); // +1 for null terminator
  }

  dns.questions?.forEach(q => {
    totalSize += calculateNameSize(q.name) + 4;
  });

  dns.answers?.forEach(a => {
    totalSize += calculateNameSize(a.name) + 10 + (a.data?.length || 0);
  });

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const result = new Uint8Array(buffer);

  view.setUint16(0, dns.id);
  view.setUint16(2, dns.flags || 0);
  view.setUint16(4, dns.questions?.length || 0);
  view.setUint16(6, dns.answers?.length || 0);
  view.setUint16(8, 0); // nscount
  view.setUint16(10, 0); // arcount

  let offset = 12;

  function writeName(name: string[]) {
    name.forEach(part => {
      result[offset] = part.length;
      offset++;
      const encoder = new TextEncoder();
      const encoded = encoder.encode(part);
      result.set(encoded, offset);
      offset += encoded.length;
    });
    result[offset] = 0;
    offset++;
  }

  dns.questions?.forEach(q => {
    writeName(q.name);
    view.setUint16(offset, q.type);
    offset += 2;
    view.setUint16(offset, q.class);
    offset += 2;
  });

  dns.answers?.forEach(a => {
    writeName(a.name);
    view.setUint16(offset, a.type);
    offset += 2;
    view.setUint16(offset, a.class || 1);
    offset += 2;
    view.setUint32(offset, a.ttl || 0);
    offset += 4;
    view.setUint16(offset, a.data?.length || 0);
    offset += 2;
    if (a.data) {
      result.set(a.data, offset);
      offset += a.data.length;
    }
  });

  return result;
}

function build_ntp(ntp: Packet['ntp']): Uint8Array {
  if (!ntp) throw new Error('NTP data required');

  const buffer = new ArrayBuffer(48);
  const view = new DataView(buffer);

  view.setUint8(0, ntp.flags);
  view.setUint8(1, ntp.stratum);
  view.setUint8(2, ntp.poll);
  view.setUint8(3, ntp.precision);
  view.setUint32(4, ntp.root_delay);
  view.setUint32(8, ntp.root_disp);
  view.setUint32(12, ntp.ref_id);
  view.setUint32(16, ntp.ref_ts_i);
  view.setUint32(20, ntp.ref_ts_f);
  view.setUint32(24, ntp.ori_ts_i);
  view.setUint32(28, ntp.ori_ts_f);
  view.setUint32(32, ntp.rec_ts_i);
  view.setUint32(36, ntp.rec_ts_f);
  view.setUint32(40, ntp.trans_ts_i);
  view.setUint32(44, ntp.trans_ts_f);

  return new Uint8Array(buffer);
}

function build_udp(
  udp: Packet['udp'],
  payload?: Packet,
  srcIp?: Uint8Array,
  dstIp?: Uint8Array
): Uint8Array {
  if (!udp) throw new Error('UDP data required');

  let data: Uint8Array;

  if (payload?.dhcp) {
    data = build_dhcp(payload.dhcp);
  } else if (payload?.dns) {
    data = build_dns(payload.dns);
  } else if (payload?.ntp) {
    data = build_ntp(payload.ntp);
  } else {
    data = udp.data || new Uint8Array(0);
  }

  const buffer = new ArrayBuffer(8 + data.byteLength);
  const view = new DataView(buffer);
  const result = new Uint8Array(buffer);

  view.setUint16(0, udp.sport);
  view.setUint16(2, udp.dport);
  view.setUint16(4, 8 + data.byteLength);
  view.setUint16(6, 0); // Временная контрольная сумма

  result.set(data, 8);

  // Вычисляем контрольную сумму если предоставлены IP адреса
  if (srcIp && dstIp && (!udp.checksum || udp.checksum === 0)) {
    const checksum = calculateUDPChecksum(result, srcIp, dstIp);
    view.setUint16(6, checksum);
  } else if (udp.checksum) {
    view.setUint16(6, udp.checksum);
  }

  return result;
}

function build_ipv4(ipv4: Packet['ipv4'], payload?: Packet): Uint8Array {
  if (!ipv4) throw new Error('IPv4 data required');

  let data: Uint8Array;

  // Сначала собираем payload чтобы знать его размер
  if (ipv4.proto === IPV4_PROTO_ICMP && payload?.icmp) {
    data = build_icmp(payload.icmp);
  } else if (ipv4.proto === IPV4_PROTO_TCP && payload?.tcp) {
    // TCP будет собран позже с правильными IP адресами
    data = new Uint8Array(0); // временно
  } else if (ipv4.proto === IPV4_PROTO_UDP && payload?.udp) {
    // UDP будет собран позже с правильными IP адресами
    data = new Uint8Array(0); // временно
  } else {
    data = new Uint8Array(0);
  }

  const ihl = ipv4.ihl || 5;
  let totalLength = ihl * 4 + data.byteLength;

  // Пересчитываем длину для TCP/UDP
  if (ipv4.proto === IPV4_PROTO_TCP && payload?.tcp) {
    const tcpData = payload.tcp_data || new Uint8Array(0);
    const doff = payload.tcp.doff || 5;
    totalLength = ihl * 4 + doff * 4 + tcpData.byteLength;
  } else if (ipv4.proto === IPV4_PROTO_UDP && payload?.udp) {
    let udpPayloadData: Uint8Array;
    if (payload?.dhcp) {
      udpPayloadData = build_dhcp(payload.dhcp);
    } else if (payload?.dns) {
      udpPayloadData = build_dns(payload.dns);
    } else if (payload?.ntp) {
      udpPayloadData = build_ntp(payload.ntp);
    } else {
      udpPayloadData = payload?.udp?.data || new Uint8Array(0);
    }
    totalLength = ihl * 4 + 8 + udpPayloadData.byteLength;
  }

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const result = new Uint8Array(buffer);

  // Записываем IP заголовок с нулевой контрольной суммой
  view.setUint8(0, (ipv4.version << 4) | ihl);
  view.setUint8(1, ipv4.tos || 0);
  view.setUint16(2, totalLength);
  view.setUint16(4, /*ipv4.identification ||*/ 0);
  view.setUint16(6, ipv4.df ? 16384 : 0);
  view.setUint8(8, ipv4.ttl || 64);
  view.setUint8(9, ipv4.proto);
  view.setUint16(10, 0); // Временная контрольная сумма

  if (ipv4.src) {
    result.set(ipv4.src, 12);
  }
  if (ipv4.dest) {
    result.set(ipv4.dest, 16);
  }

  // Options padding if ihl > 5
  for (let i = 20; i < ihl * 4; i++) {
    result[i] = ipv4.opt[i - 20];
  }

  // Вычисляем и устанавливаем IP контрольную сумму
  const ipHeader = result.slice(0, ihl * 4);
  const ipChecksum = calculateIPChecksum(ipHeader);
  view.setUint16(10, ipChecksum);

  // Теперь собираем payload с правильными контрольными суммами
  if (ipv4.proto === IPV4_PROTO_ICMP && payload?.icmp) {
    // ICMP уже собран с контрольной суммой
    result.set(data, ihl * 4);
  } else if (ipv4.proto === IPV4_PROTO_TCP && payload?.tcp) {
    const tcpData = payload.tcp_data || new Uint8Array(0);
    const tcpSegment = build_tcp(payload.tcp, tcpData, ipv4.src, ipv4.dest);
    result.set(tcpSegment, ihl * 4);
  } else if (ipv4.proto === IPV4_PROTO_UDP && payload?.udp) {
    const udpSegment = build_udp(payload.udp, payload, ipv4.src, ipv4.dest);
    result.set(udpSegment, ihl * 4);
  }

  return result;
}

export function build_arp(arp: Packet['arp']): Uint8Array {
  if (!arp) throw new Error('ARP data required');

  const buffer = new ArrayBuffer(28);
  const view = new DataView(buffer);
  const result = new Uint8Array(buffer);

  view.setUint16(0, arp.htype);
  view.setUint16(2, arp.ptype);
  view.setUint8(4, 6); // hlen (MAC address length)
  view.setUint8(5, 4); // plen (IP address length)
  view.setUint16(6, arp.oper);

  if (arp.sha) {
    result.set(arp.sha.subarray(0, 6), 8);
  }
  if (arp.spa) {
    result.set(arp.spa.subarray(0, 4), 14);
  }
  if (arp.tha) {
    result.set(arp.tha.subarray(0, 6), 18);
  }
  if (arp.tpa) {
    result.set(arp.tpa.subarray(0, 4), 24);
  }

  return result;
}

export function build_eth(packet: Packet): Uint8Array {
  if (!packet.eth) throw new Error('Ethernet data required');

  let payload: Uint8Array;

  if (packet.eth.ethertype === ETHERTYPE_IPV4 && packet.ipv4) {
    payload = build_ipv4(packet.ipv4, packet);
  } else if (packet.eth.ethertype === ETHERTYPE_ARP && packet.arp) {
    payload = build_arp(packet.arp);
  } else if (packet.eth.ethertype === ETHERTYPE_IPV6) {
    throw 'Unimplemented: ipv6';
  } else {
    throw 'Unknown ethertype: ' + packet.eth.ethertype;
  }

  const buffer = new ArrayBuffer(ETH_HEADER_SIZE + payload.byteLength);
  const result = new Uint8Array(buffer);

  // Destination MAC
  if (packet.eth.dest) {
    result.set(packet.eth.dest.subarray(0, 6), 0);
  }

  // Source MAC
  if (packet.eth.src) {
    result.set(packet.eth.src.subarray(0, 6), 6);
  }

  // Ethertype
  const view = new DataView(buffer);
  view.setUint16(12, packet.eth.ethertype);

  // Payload
  result.set(payload, ETH_HEADER_SIZE);

  return result;
}
