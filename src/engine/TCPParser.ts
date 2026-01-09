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
        remoteSeq: tcp.seq,
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
        connection.state = 'established';
        connection.remoteSeq = tcp.seq; // Запоминаем seq сервера

        this.sendTCPPacket(
          packet.eth.src,
          remoteIP,
          localPort,
          remotePort,
          connection.localSeq + 1, // Seq = localSeq + 1 (SYN занял 1 байт)
          tcp.seq + 1, // Ack = remoteSeq + 1 (SYN занял 1 байт)
          false, // SYN = false
          true, // ACK = true
          false, // FIN = false
          false, // RST = false
          false, // PSH = false
          connection.windowSize, // Window size
          undefined // Данных нет
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
      if (tcp.seq === connection.remoteSeq) {
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

function a2ethaddr(bytes: Uint8Array) {
  return [0, 1, 2, 3, 4, 5]
    .map(i => bytes[i].toString(16))
    .map(x => (x.length === 1 ? '0' + x : x))
    .join(':');
}

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
  };

  o.tcp = tcp;

  const offset = tcp.doff * 4;
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

  const ttl = view.getUint8(8);
  const proto = view.getUint8(9);
  const ip_checksum = view.getUint16(10);

  const ipv4 = {
    version,
    ihl,
    tos,
    len,
    ttl,
    proto,
    ip_checksum,
    src: data.subarray(12, 12 + 4),
    dest: data.subarray(16, 16 + 4),
  };

  // Ethernet minmum packet size.
  if (Math.max(len, 46) !== data.length) {
    throw `ipv4 Length mismatch: ${len} != ${data.length}`;
  }

  o.ipv4 = ipv4;
  const ipdata = data.subarray(ihl * 4, len);
  if (proto === IPV4_PROTO_ICMP) {
    parse_icmp(ipdata, o);
  } else if (proto === IPV4_PROTO_TCP) {
    parse_tcp(ipdata, o);
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

export function parseparse_eth(data: Uint8Array): Packet {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const ethertype = view.getUint16(12);
  const eth = {
    ethertype: ethertype,
    dest: data.subarray(0, 6),
    dest_s: a2ethaddr(data.subarray(0, 6)),
    src: data.subarray(6, 12),
    src_s: a2ethaddr(data.subarray(6, 12)),
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
