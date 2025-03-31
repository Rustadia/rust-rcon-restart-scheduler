"use strict";

const fs = require("fs");
const WebSocket = require("ws");
const path = require("path");
const https = require("https");
const { URL } = require("url");
const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");

// Create logs folder if it doesn't exist
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`)
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple())
    }),
    new DailyRotateFile({
      filename: path.join(logsDir, "server-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d"
    })
  ]
});

const configPath = path.join(__dirname, "config.json");
if (!fs.existsSync(configPath)) {
  logger.error("config.json not found. Please create one as described in the docs.");
  process.exit(1);
}
const config = require(configPath);
const globalDiscordWebhook = config.discordWebhook || null;

class RconClient {
  constructor(serverConfig) {
    this.name = serverConfig.name;
    this.host = serverConfig.host;
    this.port = serverConfig.port;
    this.password = serverConfig.password;
    this.url = `ws://${this.host}:${this.port}/${this.password}`;
    this.ws = null;
    this.callbacks = {};
    this.lastIdentifier = 1000;
    this.connect();
  }
  connect() {
    logger.info(`[${this.name}] Connecting to RCON at ${this.url}`);
    this.ws = new WebSocket(this.url);
    this.ws.on("open", () => {
      logger.info(`[${this.name}] Connected`);
    });
    this.ws.on("message", (data) => {
      let message;
      try {
        message = JSON.parse(data);
      } catch (e) {
        logger.error(`[${this.name}] Error parsing message: ${data}`);
        return;
      }
      if (message.Identifier && message.Identifier > 1000) {
        const cb = this.callbacks[message.Identifier];
        if (cb) {
          cb(message);
          delete this.callbacks[message.Identifier];
        }
        return;
      }
      // Removed generic message logging
    });
    this.ws.on("close", () => {
      logger.info(`[${this.name}] Connection closed`);
    });
    this.ws.on("error", (err) => {
      logger.error(`[${this.name}] Connection error: ${err}`);
    });
  }
  sendCommand(cmd, callback) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      logger.error(`[${this.name}] WebSocket not open. Cannot send: ${cmd}`);
      return;
    }
    let identifier = -1;
    if (callback) {
      this.lastIdentifier++;
      identifier = this.lastIdentifier;
      this.callbacks[identifier] = callback;
    }
    const packet = { Identifier: identifier, Message: cmd, Name: "NodeRcon" };
    this.ws.send(JSON.stringify(packet));
    logger.info(`[${this.name}] Sent command: ${cmd}`);
  }
  sendAnnouncement(message) {
    const prefix = "[Notification] ";
    const fullMessage = `${prefix}${message}`;
    this.sendCommand(`say ${fullMessage}`);
  }
  saveServer() {
    this.sendCommand("server.save");
  }
  restartServer() {
    this.sendCommand("restart 0");
  }
}

function formatTime(totalSeconds) {
  totalSeconds = Math.floor(totalSeconds);
  if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const minuteStr = minutes === 1 ? "minute" : "minutes";
    if (seconds > 0) {
      const secondStr = seconds === 1 ? "second" : "seconds";
      return `${minutes} ${minuteStr} and ${seconds} ${secondStr}`;
    }
    return `${minutes} ${minuteStr}`;
  }
  return totalSeconds === 1 ? "1 second" : `${totalSeconds} seconds`;
}

function sendDiscordNotification(webhookUrl, serverName, restartType, reconnectMsg) {
  const payload = JSON.stringify({
    embeds: [
      {
        title: `${serverName} - ${restartType}`,
        description: reconnectMsg,
        color: 16711680
      }
    ]
  });
  try {
    const parsedUrl = new URL(webhookUrl);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      res.on("data", () => {});
    });
    req.on("error", (err) => {
      logger.error(`[${serverName}] Discord webhook error: ${err}`);
    });
    req.write(payload);
    req.end();
    logger.info(`[${serverName}] Discord notification sent.`);
  } catch (error) {
    logger.error(`[${serverName}] Failed to send Discord notification: ${error}`);
  }
}

function scheduleRestart(rconClient, eventTime, scheduleName = "Daily restart") {
  const now = new Date();
  const msUntilRestart = eventTime - now;
  if (msUntilRestart <= 0) {
    logger.info(`[${rconClient.name}] Event time already passed.`);
    return;
  }
  logger.info(`[${rconClient.name}] Scheduling ${scheduleName} at ${eventTime.toISOString()} (in ${Math.floor(msUntilRestart / 1000)} seconds)`);
  const intervals = [1800, 1200, 900, 600, 300, 120, 60, 30, 10, 5];
  intervals.forEach((interval) => {
    if (msUntilRestart / 1000 > interval) {
      const delay = msUntilRestart - interval * 1000;
      setTimeout(() => {
        const remaining = (eventTime - new Date()) / 1000;
        if (remaining >= interval - 1) {
          rconClient.sendAnnouncement(`${scheduleName} in ${formatTime(interval)}`);
          logger.info(`[${rconClient.name}] Announced: ${scheduleName} in ${formatTime(interval)}`);
        }
      }, delay);
    }
  });
  setTimeout(() => {
    if (globalDiscordWebhook) {
      sendDiscordNotification(globalDiscordWebhook, rconClient.name, scheduleName, "Reconnect in 5 minutes");
    }
    rconClient.sendAnnouncement("Restarting now...");
    rconClient.saveServer();
    setTimeout(() => {
      rconClient.restartServer();
    }, 2000);
    logger.info(`[${rconClient.name}] Executed restart`);
  }, msUntilRestart);
}

function getNextRestartTime(timeString) {
  const [hours, minutes] = timeString.split(":").map(Number);
  const now = new Date();
  let next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes, 0));
  if (next <= now) {
    next = new Date(next.getTime() + 24 * 60 * 60 * 1000);
  }
  return next;
}

config.servers.forEach((serverConfig) => {
  const client = new RconClient(serverConfig);
  if (serverConfig.dailyRestartTimesUTC && Array.isArray(serverConfig.dailyRestartTimesUTC)) {
    serverConfig.dailyRestartTimesUTC.forEach((timeStr) => {
      const nextRestart = getNextRestartTime(timeStr);
      scheduleRestart(client, nextRestart, "Daily restart");
    });
  }
});
