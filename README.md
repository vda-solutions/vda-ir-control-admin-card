# VDA IR Control Admin Card

A Lovelace card for Home Assistant that provides a complete administration interface for managing your VDA IR Control system.

## What This Does

The Admin Card is your control center for:

- **Board Management** - Discover, configure, and monitor ESP32 IR boards
- **Port Configuration** - Set up GPIO pins for IR output and input
- **Device Profiles** - Create and manage IR code profiles for your devices
- **Controlled Devices** - Link physical devices (TVs, receivers, etc.) to board ports
- **Serial Devices** - Configure RS-232/USB serial controlled devices
- **Network Devices** - Configure HDMI matrices and other network-controllable devices
- **Device Groups** - Create groups to control multiple devices together
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
2. Click the menu icon and select **Custom repositories**
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

## Features

### Board Discovery & Configuration
Discover ESP32 boards on your network and configure their GPIO ports for IR transmission and receiving.

### Device Management
Create controlled devices by linking IR profiles to board outputs. Support for IR, serial, and network devices.

### Device Groups
Create groups of devices (IR and serial) to control together. Configure sequence delays for sending commands to multiple devices.

### Profile Management
- **Community Profiles** - Sync profiles from the vda-ir-profiles repository
- **Downloaded Profiles** - Browse and use synced profiles
- **Custom Profiles** - Create your own profiles through IR learning

### Built-in Remote Test
Test IR commands directly from the admin card with a built-in remote interface featuring:
- Power controls
- Navigation D-pad
- Volume and channel controls
- Number pad
- Playback controls
- Input selection

### SVG Icons
All interface icons use crisp SVG graphics for optimal display at any resolution.

## Requirements

- Home Assistant 2023.1 or newer
- [VDA IR Control Integration](https://github.com/vda-solutions/vda-ir-control) v1.6.0 or newer
- At least one [VDA IR Firmware](https://github.com/vda-solutions/vda-ir-firmware) board flashed and connected

## Changelog

### v1.9.0
- Projector screen linking - link screens to trigger devices (projectors)
- Configurable screen delay timing for precise positioning
- Serial device trigger support in dropdown
- Enhanced device filtering for screen linking

### v1.8.0
- HA Remote Device support (Apple TV, Roku, Android TV, etc.)
- Serial device management improvements
- Matrix routing sensors

### v1.7.0
- Serial device drivers with community sync
- Improved profile management
- Bug fixes for port assignments

### v1.6.0
- Added Device Groups tab for creating and managing device groups
- All icons converted to SVG for crisp display
- Improved accordion navigation with SVG arrows
- Enhanced remote test interface with SVG controls

## License

MIT License - See [LICENSE](LICENSE) for details.
