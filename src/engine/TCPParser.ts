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

    // Обработка ACK на SYN-ACK
    if (tcp.ack && !tcp.syn && connection.state === TCP_STATE_SYN_RECEIVED) {
      if (tcp.ackn === connection.localSeq + 1) {
        connection.state = TCP_STATE_ESTABLISHED;
        connection.remoteAck = tcp.ackn;
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
      if (tcp.seq === connection.remoteAck) {
        // Отправляем ACK на полученные данные
        this.sendTCPPacket(
          packet.eth.src,
          remoteIP,
          localPort,
          remotePort,
          connection.localSeq,
          connection.remoteAck + packet.tcp_data.length,
          false,
          true,
          false,
          false,
          false,
          connection.windowSize,
          undefined
        );

        // Обновляем sequence number
        connection.remoteAck += packet.tcp_data.length;

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
        true
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
