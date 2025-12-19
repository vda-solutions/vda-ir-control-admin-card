# VDA IR Control Admin Card

A Lovelace card for Home Assistant that provides a complete administration interface for managing your VDA IR Control system.

## What This Does

The Admin Card is your control center for:

- **Board Management** - Discover, configure, and monitor ESP32 IR boards
- **Port Configuration** - Set up GPIO pins for IR output and input
- **Device Profiles** - Create and manage IR code profiles for your devices
- **Controlled Devices** - Link physical devices (TVs, receivers, etc.) to board ports
- **Network Devices** - Configure HDMI matrices and other network-controllable devices
- **Community Profiles** - Sync and use IR profiles from the community repository

## Part of the VDA IR Control Ecosystem

This card is one component of the complete VDA IR Control system:

| Repository | Purpose | Required |
|------------|---------|----------|
| [vda-ir-control](https://github.com/vda-solutions/vda-ir-control) | Home Assistant Integration | Yes |
| **vda-ir-control-admin-card** | Admin/Management Card (this repo) | Yes |
| [vda-ir-remote-card](https://github.com/vda-solutions/vda-ir-remote-card) | Remote Control Card | Optional |
| [vda-ir-firmware](https://github.com/vda-solutions/vda-ir-firmware) | ESP32 Firmware | Yes |
| [vda-ir-profiles](https://github.com/vda-solutions/vda-ir-profiles) | Community IR Profiles | Optional |

## Installation

### Via HACS (Recommended)

1. Open HACS
2. Click ⋮ → **Custom repositories**
3. Add: `https://github.com/vda-solutions/vda-ir-control-admin-card`
4. Type: **Dashboard**
5. Click **Add**
6. Download "VDA IR Control Admin Card"
7. Hard refresh browser (Ctrl+Shift+R)

### Manual Installation

1. Download `vda-ir-control-card.js` from the [latest release](https://github.com/vda-solutions/vda-ir-control-admin-card/releases)
2. Copy to your `config/www/` folder
3. Add the resource in Lovelace:
   - Go to **Settings** → **Dashboards** → **Resources**
   - Add `/local/vda-ir-control-card.js` as JavaScript Module

## Usage

Add the card to your dashboard:

```yaml
type: custom:vda-ir-control-card
```

## Screenshots

### Board Discovery & Configuration
Discover ESP32 boards on your network and configure their GPIO ports.

### Device Management
Create controlled devices by linking IR profiles to board outputs.

### Profile Management
View built-in profiles, sync community profiles, or create your own through IR learning.

## Requirements

- Home Assistant 2023.1 or newer
- [VDA IR Control Integration](https://github.com/vda-solutions/vda-ir-control) installed
- At least one [VDA IR Firmware](https://github.com/vda-solutions/vda-ir-firmware) board flashed and connected

## License

MIT License - See [LICENSE](LICENSE) for details.
