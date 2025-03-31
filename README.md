# Rust RCON Restart Scheduler

![Example](https://i.imgur.com/cGk7Z8f.png)

## Overview

Rust RCON Restart Scheduler is a simple Node.js script that automates your Rust server restarts. It features dynamic in-game countdown notifications, instant restart commands, Discord webhook notifications, and the ability to manage multiple Rust server connections—all with daily log rotation.

## Features

- **Dynamic In-Game Countdown:** Sends in-game announcements with customizable countdown intervals.
- **Instant Restart:** Uses `restart 0` to restart your server immediately.
- **Multiple Server Connections:** Easily manage and schedule restarts for multiple Rust servers.
- **Discord Notifications:** Get notified with a Discord embed when a restart occurs.
- **Daily Log Rotation:** Logs are stored in a dedicated folder with daily rotation for easy management.

## Installation

1. Clone or download the repository.
2. Run the following command to install dependencies:
   ~~~bash
   npm install
   ~~~
3. Create a `config.json` file in the root directory (see below).

## Configuration

Create a `config.json` file with the following structure. **Note:** All sensitive details have been blanked out—replace these with your production values.

~~~json
{
  "discordWebhook": "",
  "servers": [
    {
      "name": "Your Server Name",
      "host": "",
      "port": 0,
      "password": "",
      "dailyRestartTimesUTC": ["HH:MM"]
    }
  ]
}
~~~

## Advanced Configuration

### Updating the Notification Prefix

To change the in-game notification prefix, edit the `sendAnnouncement` method in `server.js`:

~~~javascript
sendAnnouncement(message) {
  const prefix = "[Notification] "; // Update this prefix as desired.
  const fullMessage = `${prefix}${message}`;
  this.sendCommand(`say ${fullMessage}`);
}
~~~

### Modifying Countdown Intervals

The countdown intervals are defined in the `scheduleRestart` function. To customize these intervals, update the following array in `server.js`:

~~~javascript
const intervals = [1800, 1200, 900, 600, 300, 120, 60, 30, 10, 5];
~~~

Adjust these values (in seconds) to suit your needs.

## Running the Scheduler

Start the scheduler with:

~~~bash
npm start
~~~

## License

This project is licensed under the MIT License.
