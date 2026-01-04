/**
 * VDA IR Control Management Card
 * A custom Lovelace card for managing IR boards, profiles, and devices
 * @version 1.9.0
 */

class VDAIRControlCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = {};
    this._activeTab = 'boards';
    this._boards = [];
    this._profiles = [];
    this._devices = [];
    this._selectedBoard = null;
    this._selectedProfile = null;
    this._learningState = null;
    this._ports = [];
    this._gpioPins = [];
    this._portAssignments = {};
    this._learnInputPorts = [];
    this._deviceOutputPorts = [];
    this._builtinProfiles = [];
    this._builtinManufacturers = [];
    this._builtinDeviceTypes = [];
    // Community profiles state
    this._communityProfiles = [];
    this._syncStatus = null;
    this._isSyncing = false;
    // Serial devices state
    this._serialDevices = [];
    this._selectedSerialDevice = null;
    this._serialTestResult = null;
    this._availableSerialPorts = [];
    this._serialProfiles = [];
    // Device groups state
    this._deviceGroups = [];
    // HA remote devices state
    this._haDevices = [];
    this._haDeviceFamilies = {};
    this._haEntities = [];
    // Accordion state for profile sections
    this._expandedSections = {
      community: false,
      builtin: false,
      custom: true
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._initialized = true;
      this._loadData();
    }
  }

  setConfig(config) {
    this._config = config;
  }

  static getConfigElement() {
    return document.createElement('vda-ir-control-card-editor');
  }

  static getStubConfig() {
    return {};
  }

  async _loadData() {
    await Promise.all([
      this._loadBoards(),
      this._loadProfiles(),
      this._loadBuiltinProfiles(),
      this._loadCommunityProfiles(),
      this._loadDevices(),
      this._loadGPIOPins(),
      this._loadSerialDevices(),
      this._loadSerialProfiles(),
      this._loadDeviceGroups(),
      this._loadHADevices(),
      this._loadHADeviceFamilies(),
    ]);
    this._render();
  }

  async _loadGPIOPins(boardType = 'poe_iso') {
    try {
      const resp = await fetch(`/api/vda_ir_control/gpio_pins?board_type=${boardType}`, {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        this._gpioPins = data.pins || [];
        this._reservedPins = data.reserved || [];
        this._currentBoardType = data.board_type || boardType;
      } else {
        this._gpioPins = [];
        this._reservedPins = [];
      }
    } catch (e) {
      console.error('Failed to load GPIO pins:', e);
      this._gpioPins = [];
      this._reservedPins = [];
    }
  }

  async _loadPortAssignments(boardId) {
    try {
      const resp = await fetch(`/api/vda_ir_control/port_assignments/${boardId}`, {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        this._portAssignments = data.assignments || {};
      } else {
        this._portAssignments = {};
      }
    } catch (e) {
      console.error('Failed to load port assignments:', e);
      this._portAssignments = {};
    }
  }

  _getGPIOForPort(portNumber) {
    // Map port number to GPIO pin - returns pin info
    // The GPIO mapping will come from the board, but we have defaults
    const pin = this._gpioPins.find(p => p.gpio === portNumber);
    return pin;
  }

  async _loadLearnInputPorts(boardId) {
    try {
      const resp = await fetch(`/api/vda_ir_control/ports/${boardId}`, {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        // Filter to only IR input ports
        this._learnInputPorts = (data.ports || []).filter(p => p.mode === 'ir_input');
      } else {
        this._learnInputPorts = [];
      }
    } catch (e) {
      console.error('Failed to load input ports:', e);
      this._learnInputPorts = [];
    }
  }

  async _loadDeviceOutputPorts(boardId) {
    try {
      const resp = await fetch(`/api/vda_ir_control/ports/${boardId}`, {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        // Filter to only IR output ports
        this._deviceOutputPorts = (data.ports || []).filter(p => p.mode === 'ir_output');
      } else {
        this._deviceOutputPorts = [];
      }
    } catch (e) {
      console.error('Failed to load output ports:', e);
      this._deviceOutputPorts = [];
    }
  }

  async _loadBoards() {
    try {
      const resp = await fetch('/api/vda_ir_control/boards', {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        this._boards = data.boards || [];
      } else {
        this._boards = [];
      }
    } catch (e) {
      console.error('Failed to load boards:', e);
      this._boards = [];
    }
  }

  async _changeBoardType(boardId, boardType) {
    try {
      const resp = await fetch(`/api/vda_ir_control/boards/${boardId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ board_type: boardType }),
      });
      if (resp.ok) {
        // Update local board data
        const board = this._boards.find(b => b.board_id === boardId);
        if (board) {
          board.board_type = boardType;
        }
        // Reload GPIO pins for the new board type if this is the selected board
        if (this._selectedBoard === boardId) {
          await this._loadGPIOPins(boardType);
        }
        this._render();
      } else {
        console.error('Failed to update board type');
        alert('Failed to update board type');
      }
    } catch (e) {
      console.error('Failed to update board type:', e);
      alert('Failed to update board type: ' + e.message);
    }
  }

  async _loadProfiles() {
    try {
      // Fetch profiles via REST API
      const resp = await fetch('/api/vda_ir_control/profiles', {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        this._profiles = data.profiles || [];
      } else {
        this._profiles = [];
      }
    } catch (e) {
      console.error('Failed to load profiles:', e);
      this._profiles = [];
    }
  }

  async _loadBuiltinProfiles() {
    try {
      const resp = await fetch('/api/vda_ir_control/builtin_profiles', {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        this._builtinProfiles = data.profiles || [];
        this._builtinManufacturers = data.available_manufacturers || [];
        this._builtinDeviceTypes = data.available_device_types || [];
      } else {
        this._builtinProfiles = [];
        this._builtinManufacturers = [];
        this._builtinDeviceTypes = [];
      }
    } catch (e) {
      console.error('Failed to load built-in profiles:', e);
      this._builtinProfiles = [];
      this._builtinManufacturers = [];
      this._builtinDeviceTypes = [];
    }
  }

  async _loadCommunityProfiles() {
    try {
      const resp = await fetch('/api/vda_ir_control/community_profiles', {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        this._communityProfiles = data.profiles || [];
        this._syncStatus = {
          last_sync: data.last_sync,
          manifest_version: data.manifest_version,
          repository_url: data.repository_url,
        };
      } else {
        this._communityProfiles = [];
        this._syncStatus = null;
      }
    } catch (e) {
      console.error('Failed to load community profiles:', e);
      this._communityProfiles = [];
      this._syncStatus = null;
    }
  }

  async _syncCommunityProfiles() {
    if (this._isSyncing) return;

    // Check if any boards are adopted
    if (!this._boards || this._boards.length === 0) {
      alert('Please adopt an IR Node to sync IR Profiles.\n\nFor more info visit:\nhttps://github.com/vda-solutions/vda-ir-control');
      return;
    }

    this._isSyncing = true;
    this._render();

    try {
      const resp = await fetch('/api/vda_ir_control/sync_profiles', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });

      if (resp.ok) {
        const result = await resp.json();
        if (result.success) {
          // Reload community profiles
          await this._loadCommunityProfiles();
          // notification removed;
        } else {
          // notification removed;
        }
      } else {
        // notification removed;
      }
    } catch (e) {
      console.error('Failed to sync community profiles:', e);
      // notification removed;
    } finally {
      this._isSyncing = false;
      this._render();
    }
  }

  async _downloadCommunityProfile(profileId) {
    if (this._isDownloading) return;

    this._isDownloading = profileId;
    this._render();

    try {
      console.log('Downloading profile:', profileId);
      const resp = await fetch(`/api/vda_ir_control/download_profile/${profileId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });

      console.log('Download response:', resp.status);
      if (resp.ok) {
        const result = await resp.json();
        console.log('Download result:', result);
        if (result.success) {
          // Reload community profiles to show updated download status
          await this._loadCommunityProfiles();
          // Reload builtin profiles since downloaded profiles appear there
          await this._loadBuiltinProfiles();
          console.log('Profile downloaded successfully');
        } else {
          console.error('Failed to download profile:', result.message);
        }
      } else {
        console.error('Failed to download profile:', resp.status);
      }
    } catch (e) {
      console.error('Failed to download profile:', e);
    } finally {
      this._isDownloading = null;
      this._render();
    }
  }

  async _exportProfileForContribution(profileId) {
    try {
      const resp = await fetch(`/api/vda_ir_control/export_profile/${profileId}`, {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });

      if (resp.ok) {
        const data = await resp.json();
        // Show export modal
        this._exportModal = {
          profileId: profileId,
          profileName: data.profile_name,
          exportJson: data.export_json,
          suggestedPath: data.suggested_path,
          contributionUrl: data.contribution_url,
          repositoryUrl: data.repository_url,
        };
        this._render();
      } else {
        // notification removed;
      }
    } catch (e) {
      console.error('Failed to export profile:', e);
      // notification removed;
    }
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _formatLastSync(isoString) {
    if (!isoString) return 'Never synced';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch (e) {
      return isoString;
    }
  }

  async _loadDevices() {
    try {
      // Fetch devices via REST API
      const resp = await fetch('/api/vda_ir_control/devices', {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        this._devices = data.devices || [];
      } else {
        this._devices = [];
      }
    } catch (e) {
      console.error('Failed to load devices:', e);
      this._devices = [];
    }
  }

  async _loadSerialDevices() {
    try {
      const resp = await fetch('/api/vda_ir_control/serial_devices', {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        this._serialDevices = data.devices || [];
      } else {
        this._serialDevices = [];
      }
    } catch (e) {
      console.error('Failed to load serial devices:', e);
      this._serialDevices = [];
    }
  }

  async _loadSerialProfiles() {
    try {
      const resp = await fetch('/api/vda_ir_control/serial_profiles', {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        this._serialProfiles = data.profiles || [];
      } else {
        this._serialProfiles = [];
      }
    } catch (e) {
      console.error('Failed to load serial profiles:', e);
      this._serialProfiles = [];
    }
  }

  async _loadDeviceGroups() {
    try {
      const resp = await fetch('/api/vda_ir_control/device_groups', {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        this._deviceGroups = data.groups || [];
      } else {
        this._deviceGroups = [];
      }
    } catch (e) {
      console.error('Failed to load device groups:', e);
      this._deviceGroups = [];
    }
  }

  async _loadHADevices() {
    try {
      const resp = await fetch('/api/vda_ir_control/ha_devices', {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        this._haDevices = data.devices || [];
      } else {
        this._haDevices = [];
      }
    } catch (e) {
      console.error('Failed to load HA devices:', e);
      this._haDevices = [];
    }
  }

  async _loadHADeviceFamilies() {
    try {
      const resp = await fetch('/api/vda_ir_control/ha_device_families', {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        this._haDeviceFamilies = data.families || {};
      } else {
        this._haDeviceFamilies = {};
      }
    } catch (e) {
      console.error('Failed to load HA device families:', e);
      this._haDeviceFamilies = {};
    }
  }

  async _loadHAEntities() {
    try {
      const resp = await fetch('/api/vda_ir_control/ha_entities', {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        this._haEntities = data.entities || [];
      } else {
        this._haEntities = [];
      }
    } catch (e) {
      console.error('Failed to load HA entities:', e);
      this._haEntities = [];
    }
  }

  async _loadSerialDevice(deviceId) {
    try {
      const resp = await fetch(`/api/vda_ir_control/serial_devices/${deviceId}`, {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {
      console.error('Failed to load serial device:', e);
    }
    return null;
  }

  async _loadAvailableSerialPorts() {
    try {
      const resp = await fetch('/api/vda_ir_control/serial_ports', {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        this._availableSerialPorts = data.ports || [];
      } else {
        this._availableSerialPorts = [];
      }
    } catch (e) {
      console.error('Failed to load serial ports:', e);
      this._availableSerialPorts = [];
    }
  }


  async _loadPorts(boardId) {
    try {
      // Get board to know its type
      const board = this._boards.find(b => b.board_id === boardId);
      const boardType = board?.board_type || 'poe_iso';

      // Fetch ports via REST API, port assignments, and GPIO pins for this board type
      const [portsResp] = await Promise.all([
        fetch(`/api/vda_ir_control/ports/${boardId}`, {
          headers: {
            'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
          },
        }),
        this._loadPortAssignments(boardId),
        this._loadGPIOPins(boardType),
      ]);
      if (portsResp.ok) {
        const data = await portsResp.json();
        this._ports = data.ports || [];
      } else {
        // Try fetching directly from board IP
        if (board && board.ip_address) {
          try {
            const directResp = await fetch(`http://${board.ip_address}/ports`);
            if (directResp.ok) {
              const data = await directResp.json();
              this._ports = data.ports || [];
            } else {
              this._ports = [];
            }
          } catch (e) {
            console.error('Failed to fetch ports directly from board:', e);
            this._ports = [];
          }
        } else {
          this._ports = [];
        }
      }
      this._render();
    } catch (e) {
      console.error('Failed to load ports:', e);
      // Try fetching directly from board IP as last resort
      const board = this._boards.find(b => b.board_id === boardId);
      const boardType = board?.board_type || 'poe_iso';
      await this._loadGPIOPins(boardType);
      if (board && board.ip_address) {
        try {
          const directResp = await fetch(`http://${board.ip_address}/ports`);
          if (directResp.ok) {
            const data = await directResp.json();
            this._ports = data.ports || [];
          } else {
            this._ports = [];
          }
        } catch (e2) {
          console.error('Failed to fetch ports directly from board:', e2);
          this._ports = [];
        }
      } else {
        this._ports = [];
      }
      this._render();
    }
  }

  async _callService(domain, service, data) {
    // Use regular service call (no response needed)
    await this._hass.callService(domain, service, data);
  }

  _getBoards() {
    // Return boards loaded from API
    return this._boards || [];
  }

  _render() {
    const boards = this._getBoards();

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 16px;
          position: relative;
        }
        .card {
          background: var(--ha-card-background, var(--card-background-color, white));
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,0.1));
          padding: 16px;
        }
        .header {
          display: flex;
          align-items: center;
          margin-bottom: 16px;
        }
        .header h2 {
          margin: 0;
          flex: 1;
          font-size: 1.4em;
          color: var(--primary-text-color);
        }
        .tabs {
          display: flex;
          border-bottom: 1px solid var(--divider-color);
          margin-bottom: 16px;
        }
        .tab {
          padding: 12px 20px;
          cursor: pointer;
          border: none;
          background: none;
          color: var(--secondary-text-color);
          font-size: 14px;
          font-weight: 500;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }
        .tab:hover {
          color: var(--primary-color);
        }
        .tab.active {
          color: var(--primary-color);
          border-bottom-color: var(--primary-color);
        }
        .content {
          min-height: 300px;
        }
        .list-item {
          display: flex;
          align-items: center;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 8px;
          background: var(--secondary-background-color);
          cursor: pointer;
          transition: background 0.2s;
        }
        .list-item:hover {
          background: var(--primary-color);
          color: white;
        }
        .list-item.selected {
          background: var(--primary-color);
          color: white;
        }
        .list-item-content {
          flex: 1;
        }
        .list-item-title {
          font-weight: 500;
          margin-bottom: 2px;
        }
        .list-item-subtitle {
          font-size: 12px;
          opacity: 0.7;
        }
        .list-item-actions {
          display: flex;
          gap: 8px;
        }
        .btn {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }
        .btn-primary {
          background: var(--primary-color);
          color: white;
        }
        .btn-primary:hover {
          opacity: 0.9;
        }
        .btn-secondary {
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
        }
        .btn-danger {
          background: var(--error-color, #db4437);
          color: white;
        }
        .btn-success {
          background: var(--success-color, #4caf50);
          color: white;
        }
        .btn-small {
          padding: 4px 12px;
          font-size: 12px;
        }
        .form-group {
          margin-bottom: 16px;
        }
        .form-group label {
          display: block;
          margin-bottom: 4px;
          font-weight: 500;
          font-size: 14px;
          color: var(--primary-text-color, #212121);
        }
        .form-group input, .form-group select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 6px;
          font-size: 14px;
          background: var(--input-fill-color, var(--secondary-background-color, #f5f5f5));
          color: var(--primary-text-color, #212121);
          box-sizing: border-box;
        }
        .form-group select option {
          background: var(--card-background-color, white);
          color: var(--primary-text-color, #212121);
        }
        .form-group input:focus, .form-group select:focus {
          outline: none;
          border-color: var(--primary-color);
        }
        .form-row {
          display: flex;
          gap: 16px;
        }
        .form-row .form-group {
          flex: 1;
        }
        .section {
          margin-bottom: 24px;
        }
        .section-title {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 12px;
          color: var(--primary-text-color);
        }
        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--secondary-text-color);
        }
        .empty-state-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        .badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 500;
          margin-left: 8px;
        }
        .badge-success {
          background: var(--success-color, #4caf50);
          color: white;
        }
        .badge-warning {
          background: var(--warning-color, #ff9800);
          color: white;
        }
        .badge-info {
          background: var(--info-color, #2196f3);
          color: white;
        }
        .port-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 8px;
        }
        .port-item {
          padding: 12px;
          border-radius: 8px;
          background: var(--secondary-background-color, #f5f5f5);
          color: var(--primary-text-color, #212121);
          text-align: center;
          cursor: pointer;
        }
        .port-item.input {
          border: 2px solid var(--info-color, #2196f3);
        }
        .port-item.output {
          border: 2px solid var(--success-color, #4caf50);
        }
        .port-item.disabled {
          opacity: 0.5;
          border: 2px solid transparent;
        }
        .port-item.assigned {
          box-shadow: 0 0 0 2px var(--warning-color, #ff9800);
        }
        .port-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        .port-number {
          font-size: 14px;
          font-weight: bold;
          color: var(--primary-text-color, #212121);
        }
        .port-gpio {
          font-size: 12px;
          font-weight: 600;
          color: var(--primary-color);
          margin-top: 2px;
        }
        .port-mode {
          font-size: 10px;
          text-transform: uppercase;
          margin-top: 4px;
          color: var(--secondary-text-color, #666);
        }
        .port-name {
          font-size: 11px;
          margin-top: 4px;
          color: var(--primary-text-color, #212121);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .port-devices {
          font-size: 10px;
          margin-top: 4px;
          padding: 2px 6px;
          background: var(--warning-color, #ff9800);
          color: white;
          border-radius: 10px;
          display: inline-block;
        }
        .learning-status {
          padding: 16px;
          border-radius: 8px;
          background: var(--info-color, #2196f3);
          color: white;
          margin-bottom: 16px;
          text-align: center;
        }
        .learning-status.success {
          background: var(--success-color, #4caf50);
        }
        .command-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 8px;
          margin-top: 12px;
        }
        .command-btn {
          padding: 10px;
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 6px;
          background: var(--secondary-background-color, #f5f5f5);
          color: var(--primary-text-color, #212121);
          cursor: pointer;
          font-size: 12px;
          text-align: center;
          transition: all 0.2s;
        }
        .command-btn:hover {
          border-color: var(--primary-color);
          background: var(--primary-color);
          color: white;
        }
        .command-btn.learned {
          background: var(--success-color, #4caf50);
          color: white;
          border-color: var(--success-color, #4caf50);
        }
        .remote-btn {
          padding: 12px 16px;
          border: none;
          border-radius: 8px;
          background: var(--secondary-background-color, #e0e0e0);
          color: var(--primary-text-color, #212121);
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.15s;
          min-width: 50px;
        }
        .remote-btn:hover {
          background: var(--primary-color);
          color: white;
          transform: scale(1.05);
        }
        .remote-btn:active {
          transform: scale(0.95);
        }
        .remote-btn.power {
          background: var(--error-color, #f44336);
          color: white;
          font-size: 18px;
          padding: 12px 24px;
        }
        .remote-btn.power:hover {
          background: #d32f2f;
        }
        .remote-btn.nav {
          width: 50px;
          height: 50px;
          padding: 0;
          font-size: 18px;
        }
        .remote-btn.nav.ok {
          background: var(--primary-color);
          color: white;
          border-radius: 50%;
        }
        .remote-btn.vol, .remote-btn.chan {
          width: 50px;
          height: 40px;
          font-size: 20px;
          font-weight: bold;
        }
        .remote-btn.vol.mute {
          font-size: 16px;
        }
        .remote-btn.num {
          width: 50px;
          height: 45px;
          font-size: 18px;
          font-weight: 600;
        }
        .remote-btn.input {
          font-size: 11px;
          padding: 8px 12px;
        }
        .remote-btn.play {
          font-size: 16px;
          padding: 10px 14px;
        }
        .remote-btn.play.record {
          color: var(--error-color, #f44336);
        }
        .remote-section {
          padding: 12px;
          background: var(--secondary-background-color, #f5f5f5);
          border-radius: 12px;
        }
        .modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }
        .modal-content {
          background: var(--ha-card-background, var(--card-background-color, white));
          color: var(--primary-text-color, #212121);
          border-radius: 12px;
          padding: 24px;
          max-width: 550px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          overflow-x: hidden;
        }
        .modal-title {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 16px;
          color: var(--primary-text-color, #212121);
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 24px;
        }
      </style>

      <div class="card">
        <div class="header">
          <h2>VDA IR Control</h2>
        </div>

        <div class="tabs">
          <button class="tab ${this._activeTab === 'boards' ? 'active' : ''}" data-tab="boards">
            Boards
          </button>
          <button class="tab ${this._activeTab === 'profiles' ? 'active' : ''}" data-tab="profiles">
            Profiles
          </button>
          <button class="tab ${this._activeTab === 'devices' ? 'active' : ''}" data-tab="devices">
            Devices
          </button>
          <button class="tab ${this._activeTab === 'serial' ? 'active' : ''}" data-tab="serial">
            Serial
          </button>
          <button class="tab ${this._activeTab === 'groups' ? 'active' : ''}" data-tab="groups">
            Groups
          </button>
          <button class="tab ${this._activeTab === 'hadevices' ? 'active' : ''}" data-tab="hadevices">
            HA Devices
          </button>
        </div>

        <div class="content">
          ${this._renderTabContent(boards)}
        </div>
      </div>

      ${this._renderModal()}
    `;

    this._attachEventListeners();
  }

  _renderTabContent(boards) {
    switch (this._activeTab) {
      case 'boards':
        return this._renderBoardsTab(boards);
      case 'profiles':
        return this._renderProfilesTab();
      case 'devices':
        return this._renderDevicesTab();
      case 'serial':
        return this._renderSerialTab();
      case 'groups':
        return this._renderGroupsTab();
      case 'hadevices':
        return this._renderHADevicesTab();
      default:
        return '';
    }
  }

  _renderBoardsTab(boards) {
    if (boards.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">📡</div>
          <p>No boards configured</p>
          <p style="font-size: 12px;">Add a board through the integration settings</p>
        </div>
      `;
    }

    return `
      <div class="section">
        <div class="section-title">Connected Boards</div>
        ${boards.map(board => `
          <div class="list-item ${this._selectedBoard === board.board_id ? 'selected' : ''}"
               data-action="select-board" data-board-id="${board.board_id}">
            <div class="list-item-content">
              <div class="list-item-title">
                ${board.board_name}
                <span class="badge badge-success">Online</span>
                <span class="badge" style="background: var(--secondary-background-color); color: var(--primary-text-color);">${board.board_type === 'devkit' ? 'DevKit' : 'POE-ISO'}</span>
              </div>
              <div class="list-item-subtitle">
                ${board.board_id} • ${board.ip_address}
              </div>
            </div>
            <div class="list-item-actions" style="display: flex; gap: 8px; align-items: center;">
              <select class="board-type-select" data-action="change-board-type" data-board-id="${board.board_id}"
                      style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); font-size: 12px;"
                      onclick="event.stopPropagation()">
                <option value="poe_iso" ${board.board_type !== 'devkit' ? 'selected' : ''}>ESP32-POE-ISO</option>
                <option value="devkit" ${board.board_type === 'devkit' ? 'selected' : ''}>ESP32 DevKit</option>
              </select>
              <button class="btn btn-secondary btn-small" data-action="configure-ports" data-board-id="${board.board_id}" onclick="event.stopPropagation()">
                Configure Ports
              </button>
            </div>
          </div>
        `).join('')}
      </div>

      ${this._selectedBoard ? this._renderPortConfig() : ''}
    `;
  }

  _renderPortConfig() {
    if (this._ports.length === 0 && this._gpioPins.length === 0) {
      return `
        <div class="section">
          <div class="section-title">Port Configuration</div>
          <p style="color: var(--primary-text-color);">Loading ports...</p>
        </div>
      `;
    }

    // Get current board's type
    const currentBoard = this._boards.find(b => b.board_id === this._selectedBoard);
    const boardType = currentBoard?.board_type || 'poe_iso';
    const boardTypeName = boardType === 'devkit' ? 'ESP32 DevKit' : 'ESP32-POE-ISO';

    // Use GPIO pins if ports not loaded yet
    const portsToShow = this._ports.length > 0 ? this._ports : this._gpioPins
      .filter(p => p.can_output || p.can_input)
      .map(p => ({ port: p.gpio, gpio: p.gpio, mode: 'disabled', name: '' }));

    const portSource = this._ports.length > 0 ? 'board' : 'fallback';
    return `
      <div class="section">
        <div class="section-title">Port Configuration - ${this._selectedBoard}</div>
        <p style="font-size: 12px; color: var(--secondary-text-color); margin-bottom: 12px;">
          ${boardTypeName} GPIO pins ${portSource === 'board' ? '(from board)' : '(fallback)'} available for IR. Click a port to configure.
        </p>
        <div class="port-grid">
          ${portsToShow.map(port => {
            const gpioPin = this._gpioPins.find(p => p.gpio === port.port || p.gpio === port.gpio);
            const assignments = this._portAssignments[port.port] || [];
            const hasAssignments = assignments.length > 0;

            const mode = port.mode || 'disabled';
            return `
              <div class="port-item ${mode === 'ir_input' ? 'input' : mode === 'ir_output' ? 'output' : 'disabled'} ${hasAssignments ? 'assigned' : ''}"
                   data-action="edit-port" data-port="${port.port}"
                   title="${gpioPin ? gpioPin.notes : ''}">
                <div class="port-number">Port ${port.port}</div>
                <div class="port-gpio">${gpioPin ? gpioPin.name : `GPIO${port.port}`}</div>
                <div class="port-mode">${mode.replace('ir_', '').replace('_', ' ')}</div>
                <div class="port-name">${port.name || '-'}</div>
                ${hasAssignments ? `<div class="port-devices">${assignments.length} device${assignments.length > 1 ? 's' : ''}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
        ${this._renderPortLegend()}
      </div>
    `;
  }

  _renderPortLegend() {
    return `
      <div style="margin-top: 16px; padding: 12px; background: var(--secondary-background-color, #f5f5f5); border-radius: 8px;">
        <div style="font-size: 12px; font-weight: 500; margin-bottom: 8px; color: var(--primary-text-color);">Legend</div>
        <div style="display: flex; gap: 16px; flex-wrap: wrap; font-size: 11px; color: var(--primary-text-color);">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="width: 12px; height: 12px; border-radius: 3px; border: 2px solid var(--success-color, #4caf50);"></span>
            IR Output
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="width: 12px; height: 12px; border-radius: 3px; border: 2px solid var(--info-color, #2196f3);"></span>
            IR Input (Receiver)
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="width: 12px; height: 12px; border-radius: 3px; background: var(--disabled-text-color, #999); opacity: 0.5;"></span>
            Disabled
          </div>
        </div>
        <div style="margin-top: 8px; font-size: 11px; color: var(--secondary-text-color);">
          Input-only GPIOs (34, 35, 36, 39) can only be used as IR receivers.
        </div>
      </div>
    `;
  }

  _renderProfilesTab() {
    return `
      <!-- Community Profiles Accordion -->
      <div class="accordion-section" style="margin-bottom: 8px; border: 1px solid var(--divider-color); border-radius: 8px; overflow: hidden;">
        <div class="accordion-header" data-action="toggle-section" data-section="community"
             style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--secondary-background-color); cursor: pointer; user-select: none;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="transition: transform 0.2s; transform: rotate(${this._expandedSections.community ? '90deg' : '0deg'}); display: inline-flex;"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg></span>
            <span style="font-weight: 500;">Community Profiles</span>
            <span class="badge badge-info">${this._communityProfiles.length}</span>
          </div>
          <button class="btn btn-secondary btn-small" data-action="sync-community-profiles" ${this._isSyncing ? 'disabled' : ''} onclick="event.stopPropagation()">
            ${this._isSyncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
        ${this._expandedSections.community ? `
          <div class="accordion-content" style="padding: 12px 16px; border-top: 1px solid var(--divider-color);">
            <p style="font-size: 12px; color: var(--secondary-text-color); margin-bottom: 12px;">
              Last sync: ${this._formatLastSync(this._syncStatus?.last_sync)}
              ${this._syncStatus?.repository_url ? ` • <a href="${this._syncStatus.repository_url}" target="_blank" style="color: var(--primary-color);">View Repository</a>` : ''}
            </p>
            ${this._communityProfiles.length === 0 ? `
              <p style="color: var(--secondary-text-color); font-size: 13px;">No community profiles synced. Click Sync to download.</p>
            ` : `
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px;">
                ${this._communityProfiles.map(profile => `
                  <div class="list-item" style="cursor: default; flex-direction: column; align-items: flex-start; padding: 10px;">
                    <div class="list-item-title" style="margin-bottom: 4px; font-size: 13px;">
                      ${profile.name}
                    </div>
                    <div class="list-item-subtitle" style="margin-bottom: 6px; font-size: 11px;">
                      ${profile.manufacturer} • ${profile.command_count != null ? profile.command_count + ' cmds' : 'Unknown cmds'}
                    </div>
                    <div style="display: flex; gap: 4px; width: 100%;">
                      <button class="btn btn-primary btn-small" style="flex: 1; padding: 4px 8px; font-size: 11px;" data-action="${profile.downloaded ? 'use-community-profile' : 'download-profile'}" data-profile-id="${profile.profile_id}" ${this._isDownloading === profile.profile_id ? 'disabled' : ''}>
                        ${this._isDownloading === profile.profile_id ? 'Downloading...' : (profile.downloaded ? 'Use' : 'Download')}
                      </button>
                      ${profile.downloaded ? `<button class="btn btn-danger btn-small" style="padding: 4px 6px; font-size: 11px;" data-action="delete-community-profile" data-profile-id="${profile.profile_id}" title="Remove from local cache">✕</button>` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        ` : ''}
      </div>

      <!-- Downloaded Profiles Accordion -->
      <div class="accordion-section" style="margin-bottom: 8px; border: 1px solid var(--divider-color); border-radius: 8px; overflow: hidden;">
        <div class="accordion-header" data-action="toggle-section" data-section="builtin"
             style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--secondary-background-color); cursor: pointer; user-select: none;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="transition: transform 0.2s; transform: rotate(${this._expandedSections.builtin ? '90deg' : '0deg'}); display: inline-flex;"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg></span>
            <span style="font-weight: 500;">Downloaded Profiles</span>
            <span class="badge badge-success">${this._builtinProfiles.length}</span>
          </div>
          ${this._expandedSections.builtin ? `
            <select id="builtin-filter" data-action="filter-builtin" onclick="event.stopPropagation()" style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--divider-color); background: var(--input-fill-color, var(--card-background-color)); color: var(--primary-text-color); font-size: 12px;">
              <option value="">All Types</option>
              ${this._builtinDeviceTypes.map(t => `<option value="${t}">${this._formatDeviceType(t)}</option>`).join('')}
            </select>
          ` : ''}
        </div>
        ${this._expandedSections.builtin ? `
          <div class="accordion-content" style="padding: 12px 16px; border-top: 1px solid var(--divider-color);">
            ${this._builtinProfiles.length === 0 ? `
              <p style="color: var(--secondary-text-color); font-size: 13px;">Loading built-in profiles...</p>
            ` : `
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px;">
                ${this._builtinProfiles.map(profile => `
                  <div class="list-item" style="cursor: default; flex-direction: column; align-items: flex-start; padding: 10px;">
                    <div class="list-item-title" style="margin-bottom: 4px; font-size: 13px;">
                      ${profile.name}
                    </div>
                    <div class="list-item-subtitle" style="margin-bottom: 6px; font-size: 11px;">
                      ${profile.manufacturer} • ${Object.keys(profile.codes || {}).length} cmds
                    </div>
                    <button class="btn btn-primary btn-small" style="width: 100%; padding: 4px 8px; font-size: 11px;" data-action="use-builtin-profile" data-profile-id="${profile.profile_id}">
                      Use Profile
                    </button>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        ` : ''}
      </div>

      <!-- Custom Profiles Accordion -->
      <div class="accordion-section" style="margin-bottom: 8px; border: 1px solid var(--divider-color); border-radius: 8px; overflow: hidden;">
        <div class="accordion-header" data-action="toggle-section" data-section="custom"
             style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--secondary-background-color); cursor: pointer; user-select: none;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="transition: transform 0.2s; transform: rotate(${this._expandedSections.custom ? '90deg' : '0deg'}); display: inline-flex;"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg></span>
            <span style="font-weight: 500;">My Custom Profiles</span>
            <span class="badge badge-warning">${this._profiles.length}</span>
          </div>
          <button class="btn btn-primary btn-small" data-action="create-profile" onclick="event.stopPropagation()" style="padding: 4px 10px; font-size: 12px;">
            + New
          </button>
        </div>
        ${this._expandedSections.custom ? `
          <div class="accordion-content" style="padding: 12px 16px; border-top: 1px solid var(--divider-color);">
            ${this._profiles.length === 0 ? `
              <p style="color: var(--secondary-text-color); font-size: 13px;">No custom profiles yet. Create one to learn IR codes.</p>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${this._profiles.map(profile => `
                  <div class="list-item ${this._selectedProfile === profile.profile_id ? 'selected' : ''}"
                       data-action="select-profile" data-profile-id="${profile.profile_id}" style="padding: 10px;">
                    <div class="list-item-content">
                      <div class="list-item-title" style="font-size: 13px;">
                        ${profile.name}
                        <span class="badge badge-info" style="font-size: 10px;">${profile.device_type}</span>
                      </div>
                      <div class="list-item-subtitle" style="font-size: 11px;">
                        ${profile.manufacturer || 'Unknown'} • ${profile.learned_commands?.length || 0} commands
                      </div>
                    </div>
                    <div class="list-item-actions" style="gap: 4px;">
                      <button class="btn btn-secondary btn-small" style="padding: 4px 8px; font-size: 11px;" data-action="learn-commands" data-profile-id="${profile.profile_id}">
                        Learn
                      </button>
                      <button class="btn btn-secondary btn-small" style="padding: 4px 8px; font-size: 11px;" data-action="export-profile" data-profile-id="${profile.profile_id}">
                        Export
                      </button>
                      <button class="btn btn-danger btn-small" style="padding: 4px 8px; font-size: 11px;" data-action="delete-profile" data-profile-id="${profile.profile_id}">
                        Delete
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        ` : ''}
      </div>

      ${this._renderExportModal()}
    `;
  }

  _renderExportModal() {
    if (!this._exportModal) return '';

    return `
      <div class="modal-overlay" data-action="close-export-modal">
        <div class="modal" style="max-width: 600px;" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3>Export Profile for Contribution</h3>
            <button class="modal-close" data-action="close-export-modal">&times;</button>
          </div>
          <div class="modal-content">
            <p style="margin-bottom: 16px;">
              Share your profile with the community! Copy the JSON below and submit it to the
              <a href="${this._exportModal.repositoryUrl}" target="_blank" style="color: var(--primary-color);">community profiles repository</a>.
            </p>

            <div style="margin-bottom: 12px;">
              <label style="font-weight: 500; display: block; margin-bottom: 4px;">Suggested file path:</label>
              <code style="background: var(--secondary-background-color); padding: 8px 12px; border-radius: 4px; display: block;">
                ${this._exportModal.suggestedPath}
              </code>
            </div>

            <div style="margin-bottom: 16px;">
              <label style="font-weight: 500; display: block; margin-bottom: 4px;">Profile JSON:</label>
              <textarea id="export-json" readonly style="width: 100%; height: 200px; font-family: monospace; font-size: 12px; padding: 12px; border-radius: 6px; border: 1px solid var(--divider-color); background: var(--secondary-background-color); color: var(--primary-text-color); resize: vertical;">${this._exportModal.exportJson}</textarea>
            </div>

            <div style="display: flex; gap: 12px;">
              <button class="btn btn-primary" data-action="copy-export-json">
                Copy to Clipboard
              </button>
              <a href="${this._exportModal.contributionUrl}" target="_blank" class="btn btn-secondary">
                Open Contribution Form
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _formatDeviceType(type) {
    const typeMap = {
      'tv': 'TV',
      'cable_box': 'Cable Box',
      'soundbar': 'Soundbar',
      'streaming': 'Streaming Device',
    };
    return typeMap[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  _renderDevicesTab() {
    return `
      <div class="section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div class="section-title" style="margin-bottom: 0;">Controlled Devices</div>
          <button class="btn btn-primary btn-small" data-action="create-device">
            + New Device
          </button>
        </div>

        ${this._devices.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon"><svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg></div>
            <p>No devices yet</p>
            <p style="font-size: 12px;">Create a device to link a profile to an IR output</p>
          </div>
        ` : this._devices.map(device => `
          <div class="list-item">
            <div class="list-item-content">
              <div class="list-item-title">
                ${device.name}
                ${device.location ? `<span class="badge badge-warning">${device.location}</span>` : ''}
              </div>
              <div class="list-item-subtitle">
                Board: ${device.board_id} • Port: ${device.output_port} • Profile: ${device.device_profile_id}
              </div>
            </div>
            <div class="list-item-actions">
              <button class="btn btn-secondary btn-small" data-action="test-device" data-device-id="${device.device_id}">
                Test
              </button>
              <button class="btn btn-secondary btn-small" data-action="edit-device" data-device-id="${device.device_id}">
                Edit
              </button>
              <button class="btn btn-danger btn-small" data-action="delete-device" data-device-id="${device.device_id}">
                Delete
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  _renderSerialTab() {
    return `
      <div class="section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div class="section-title" style="margin-bottom: 0;">Serial Devices</div>
          <button class="btn btn-primary btn-small" data-action="create-serial-device">
            + Add Serial Device
          </button>
        </div>

        ${this._serialDevices.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon">🔌</div>
            <p>No serial devices</p>
            <p style="font-size: 12px;">Add devices controlled via serial port (direct or via ESP32 bridge)</p>
          </div>
        ` : this._serialDevices.map(device => `
          <div class="list-item ${this._selectedSerialDevice === device.device_id ? 'selected' : ''}"
               data-action="select-serial-device" data-device-id="${device.device_id}">
            <div class="list-item-content">
              <div class="list-item-title">
                ${device.name}
                <span class="badge ${device.connected ? 'badge-success' : 'badge-danger'}">
                  ${device.connected ? 'Online' : 'Offline'}
                </span>
                <span class="badge badge-info">${device.mode === 'direct' ? 'Direct' : 'ESP32 Bridge'}</span>
                ${device.device_type === 'hdmi_matrix' ? '<span class="badge badge-info">Matrix</span>' : ''}
                ${device.location ? `<span class="badge badge-warning">${device.location}</span>` : ''}
              </div>
              <div class="list-item-subtitle">
                ${device.mode === 'direct' ? device.port : `${device.board_id} UART${device.uart_num}`}
                @ ${device.baud_rate} baud • ${device.command_count || 0} commands
              </div>
            </div>
            <div class="list-item-actions">
              <button class="btn btn-secondary btn-small" data-action="test-serial-device" data-device-id="${device.device_id}">
                Test
              </button>
              ${device.device_type === 'hdmi_matrix' ? `
              <button class="btn btn-secondary btn-small" data-action="edit-matrix-io" data-device-id="${device.device_id}" data-device-type="serial">
                Edit I/O
              </button>
              ` : ''}
              <button class="btn btn-secondary btn-small" data-action="edit-serial-device" data-device-id="${device.device_id}">
                Commands
              </button>
              <button class="btn btn-danger btn-small" data-action="delete-serial-device" data-device-id="${device.device_id}">
                Delete
              </button>
            </div>
          </div>
        `).join('')}

        ${this._selectedSerialDevice ? this._renderSerialDeviceCommands() : ''}
      </div>

      ${this._renderSerialTestResult()}
    `;
  }

  _renderSerialDeviceCommands() {
    const device = this._serialDevices.find(d => d.device_id === this._selectedSerialDevice);
    if (!device) return '';

    return `
      <div class="section" style="margin-top: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div class="section-title" style="margin-bottom: 0;">Commands for ${device.name}</div>
          <button class="btn btn-primary btn-small" data-action="add-serial-command" data-device-id="${device.device_id}">
            + Add Command
          </button>
        </div>
        <div class="command-list">
          ${!device.commands || Object.keys(device.commands || {}).length === 0 ? `
            <p style="color: var(--secondary-text-color); font-size: 12px;">No commands configured. Add commands to control this device.</p>
          ` : Object.entries(device.commands || {}).map(([id, cmd]) => `
            <div class="command-item" style="display: flex; align-items: center; padding: 8px; background: var(--secondary-background-color); border-radius: 6px; margin-bottom: 4px;">
              <div style="flex: 1;">
                <div style="font-weight: 500;">${cmd.name}</div>
                <div style="font-size: 11px; color: var(--secondary-text-color);">
                  ${cmd.payload} ${cmd.line_ending !== 'none' ? `[${cmd.line_ending.toUpperCase()}]` : ''}
                  ${cmd.is_input_option ? '<span style="color: var(--info-color);">[Input]</span>' : ''}
                  ${cmd.is_query ? '<span style="color: var(--warning-color);">[Query]</span>' : ''}
                </div>
              </div>
              <button class="btn btn-secondary btn-small" data-action="send-serial-command"
                      data-device-id="${device.device_id}" data-command-id="${id}">
                Send
              </button>
              <button class="btn btn-danger btn-small" style="margin-left: 4px;" data-action="delete-serial-command"
                      data-device-id="${device.device_id}" data-command-id="${id}">
                ×
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  _renderSerialTestResult() {
    if (!this._serialTestResult) return '';

    const result = this._serialTestResult;
    return `
      <div class="section" style="margin-top: 16px;">
        <div class="section-title">Test Result</div>
        <div style="padding: 12px; background: var(--secondary-background-color); border-radius: 8px;
                    border-left: 4px solid ${result.success ? 'var(--success-color, #4caf50)' : 'var(--error-color, #f44336)'};">
          <div style="font-weight: 500; margin-bottom: 4px;">${result.success ? 'Success' : 'Failed'}</div>
          <div style="font-size: 12px; color: var(--secondary-text-color);">
            ${result.message || (result.response ? `Response: ${result.response}` : 'No response')}
          </div>
        </div>
      </div>
    `;
  }

  _renderGroupsTab() {
    return `
      <div class="section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div class="section-title" style="margin-bottom: 0;">Device Groups</div>
          <button class="btn btn-primary btn-small" data-action="create-group">
            + Add Group
          </button>
        </div>
        <p style="font-size: 12px; color: var(--secondary-text-color); margin-bottom: 12px;">
          Create groups of devices to control with a single power button
        </p>

        ${this._deviceGroups.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon">📦</div>
            <p>No device groups</p>
            <p style="font-size: 12px;">Create groups to control multiple devices with one button</p>
          </div>
        ` : this._deviceGroups.map(group => `
          <div class="list-item" data-group-id="${group.group_id}">
            <div class="list-item-content">
              <div class="list-item-title">
                ${group.name}
                ${group.location ? `<span class="badge badge-warning">${group.location}</span>` : ''}
                <span class="badge badge-info">${group.members?.length || 0} devices</span>
              </div>
              <div class="list-item-subtitle">
                Delay: ${group.sequence_delay_ms || 20}ms between commands
              </div>
            </div>
            <div class="list-item-actions">
              <button class="btn btn-success btn-small" data-action="group-power-on" data-group-id="${group.group_id}" title="Turn all devices ON">
                All On
              </button>
              <button class="btn btn-secondary btn-small" data-action="group-power-off" data-group-id="${group.group_id}" title="Turn all devices OFF">
                All Off
              </button>
              <button class="btn btn-secondary btn-small" data-action="edit-group" data-group-id="${group.group_id}">
                Edit
              </button>
              <button class="btn btn-danger btn-small" data-action="delete-group" data-group-id="${group.group_id}">
                Delete
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  _renderHADevicesTab() {
    const familyLabels = {
      'apple_tv': 'Apple TV',
      'roku': 'Roku',
      'android_tv': 'Android TV',
      'fire_tv': 'Fire TV',
      'chromecast': 'Chromecast',
      'nvidia_shield': 'NVIDIA Shield',
      'directv': 'DirecTV',
      'custom': 'Custom',
    };

    return `
      <div class="section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div class="section-title" style="margin-bottom: 0;">Home Assistant Devices</div>
          <button class="btn btn-primary btn-small" data-action="create-ha-device">
            + Add HA Device
          </button>
        </div>
        <p style="font-size: 12px; color: var(--secondary-text-color); margin-bottom: 12px;">
          Add network streaming devices controlled by Home Assistant (Apple TV, Roku, etc.)
        </p>

        ${this._haDevices.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon"><svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg></div>
            <p>No HA devices configured</p>
            <p style="font-size: 12px;">Add devices like Apple TV, Roku, or Android TV that are already in Home Assistant</p>
          </div>
        ` : this._haDevices.map(device => `
          <div class="list-item" data-device-id="${device.device_id}">
            <div class="list-item-content">
              <div class="list-item-title">
                ${device.name}
                <span class="badge badge-info">${familyLabels[device.device_family] || device.device_family}</span>
                ${device.location ? `<span class="badge badge-warning">${device.location}</span>` : ''}
                ${device.matrix_device_id ? `<span class="badge badge-success">Matrix Linked</span>` : ''}
              </div>
              <div class="list-item-subtitle">
                Entity: ${device.entity_id}
                ${device.matrix_device_id ? ` • Matrix: ${device.matrix_port || 'Unknown port'}` : ''}
              </div>
            </div>
            <div class="list-item-actions">
              <button class="btn btn-secondary btn-small" data-action="test-ha-device" data-device-id="${device.device_id}">
                Test
              </button>
              <button class="btn btn-secondary btn-small" data-action="edit-ha-device" data-device-id="${device.device_id}">
                Edit
              </button>
              <button class="btn btn-danger btn-small" data-action="delete-ha-device" data-device-id="${device.device_id}">
                Delete
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  _renderModal() {
    if (!this._modal) return '';

    switch (this._modal.type) {
      case 'create-profile':
        return this._renderCreateProfileModal();
      case 'create-device':
        return this._renderCreateDeviceModal();
      case 'learn-commands':
        return this._renderLearnCommandsModal();
      case 'edit-port':
        return this._renderEditPortModal();
      case 'remote-control':
        return this._renderRemoteControlModal();
      case 'create-network-device':
        return this._renderCreateNetworkDeviceModal();
      case 'add-network-command':
        return this._renderAddNetworkCommandModal();
      case 'create-serial-device':
        return this._renderCreateSerialDeviceModal();
      case 'add-serial-command':
        return this._renderAddSerialCommandModal();
      case 'edit-matrix-io':
        return this._renderEditMatrixIOModal();
      case 'edit-device':
        return this._renderEditDeviceModal();
      case 'create-group':
      case 'edit-group':
        return this._renderGroupModal();
      case 'create-ha-device':
      case 'edit-ha-device':
        return this._renderHADeviceModal();
      case 'ha-remote-control':
        return this._renderHARemoteControlModal();
      default:
        return '';
    }
  }

  _renderCreateProfileModal() {
    return `
      <div class="modal" data-action="close-modal">
        <div class="modal-content" onclick="event.stopPropagation()">
          <div class="modal-title">Create Device Profile</div>

          <div class="form-group">
            <label>Profile ID</label>
            <input type="text" id="profile-id" placeholder="e.g., xfinity_xr15">
          </div>

          <div class="form-group">
            <label>Profile Name</label>
            <input type="text" id="profile-name" placeholder="e.g., Xfinity XR15 Remote">
          </div>

          <div class="form-group">
            <label>Device Type</label>
            <select id="device-type">
              <option value="cable_box">Cable/Satellite Box</option>
              <option value="tv">Television</option>
              <option value="audio_receiver">Audio Receiver/Soundbar</option>
              <option value="streaming_device">Streaming Device</option>
              <option value="dvd_bluray">DVD/Blu-ray Player</option>
              <option value="projector">Projector</option>
              <option value="custom">Custom Device</option>
            </select>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Manufacturer</label>
              <input type="text" id="manufacturer" placeholder="e.g., Comcast">
            </div>
            <div class="form-group">
              <label>Model</label>
              <input type="text" id="model" placeholder="e.g., XR15">
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" data-action="save-profile">Create Profile</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderCreateDeviceModal() {
    const boards = this._getBoards();

    return `
      <div class="modal" data-action="close-modal">
        <div class="modal-content" onclick="event.stopPropagation()">
          <div class="modal-title">Create Controlled Device</div>

          <div class="form-group">
            <label>Device ID</label>
            <input type="text" id="device-id" placeholder="e.g., bar_tv_1" value="${this._modal?.formData?.deviceId || ''}">
          </div>

          <div class="form-group">
            <label>Device Name</label>
            <input type="text" id="device-name" placeholder="e.g., Bar TV 1" value="${this._modal?.formData?.deviceName || ''}">
          </div>

          <div class="form-group">
            <label>Location</label>
            <input type="text" id="device-location" placeholder="e.g., Bar Area" value="${this._modal?.formData?.deviceLocation || ''}">
          </div>

          <div class="form-group">
            <label>Profile</label>
            <select id="device-profile">
              ${this._builtinProfiles.length > 0 ? `
                <optgroup label="Downloaded Profiles">
                  ${this._builtinProfiles.map(p => `
                    <option value="builtin:${p.profile_id}" ${(this._modal?.formData?.deviceProfile || this._modal?.preselectedProfile) === `builtin:${p.profile_id}` ? 'selected' : ''}>${p.name} (${p.manufacturer})</option>
                  `).join('')}
                </optgroup>
              ` : ''}
              ${this._profiles.length > 0 ? `
                <optgroup label="My Custom Profiles">
                  ${this._profiles.map(p => `
                    <option value="${p.profile_id}" ${(this._modal?.formData?.deviceProfile || this._modal?.preselectedProfile) === p.profile_id ? 'selected' : ''}>${p.name}</option>
                  `).join('')}
                </optgroup>
              ` : ''}
              ${this._profiles.length === 0 && this._builtinProfiles.length === 0 ? '<option value="">No profiles available</option>' : ''}
            </select>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Board</label>
              <select id="device-board" data-action="device-board-changed">
                ${boards.map(b => `
                  <option value="${b.board_id}" ${this._modal?.formData?.selectedBoard === b.board_id ? 'selected' : ''}>${b.board_name}</option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Output Port</label>
              ${this._deviceOutputPorts.length > 0 ? `
                <select id="device-port">
                  ${this._deviceOutputPorts.map(p => `
                    <option value="${p.port}">${p.gpio_name || 'GPIO' + p.gpio} - ${p.name || 'Unnamed'}</option>
                  `).join('')}
                </select>
              ` : `
                <select id="device-port" disabled>
                  <option value="">No IR outputs configured</option>
                </select>
                <div style="font-size: 11px; color: var(--warning-color, #ff9800); margin-top: 4px;">
                  Configure an IR output port on this board first (Boards tab → Configure Ports)
                </div>
              `}
            </div>
          </div>

          ${this._renderMatrixLinkSection()}

          <div class="modal-actions">
            <button class="btn btn-secondary" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" data-action="save-device">Create Device</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderLearnCommandsModal() {
    const profile = this._profiles.find(p => p.profile_id === this._modal.profileId);
    if (!profile) return '';

    const boards = this._getBoards();
    const learnedCommands = profile.learned_commands || [];

    return `
      <div class="modal" data-action="close-modal">
        <div class="modal-content" onclick="event.stopPropagation()" style="max-width: 700px;">
          <div class="modal-title">Learn IR Commands - ${profile.name}</div>

          ${this._learningState ? `
            <div class="learning-status ${this._learningState.saved ? 'success' : ''}">
              ${this._learningState.saved
                ? `Saved ${this._learningState.command} successfully!`
                : `Waiting for IR signal... Press the button on your remote`}
            </div>
          ` : ''}

          <div class="form-row" style="margin-bottom: 16px;">
            <div class="form-group">
              <label>Board</label>
              <select id="learn-board" data-action="learn-board-changed">
                ${boards.map(b => `
                  <option value="${b.board_id}">${b.board_name}</option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>IR Input Port</label>
              ${this._learnInputPorts.length > 0 ? `
                <select id="learn-port">
                  ${this._learnInputPorts.map(p => `
                    <option value="${p.port}">${p.gpio_name || 'GPIO' + p.gpio} - ${p.name || 'Unnamed'}</option>
                  `).join('')}
                </select>
              ` : `
                <select id="learn-port" disabled>
                  <option value="">No IR inputs configured</option>
                </select>
                <div style="font-size: 11px; color: var(--warning-color, #ff9800); margin-top: 4px;">
                  Configure an IR input port on this board first (Boards tab → Configure Ports)
                </div>
              `}
            </div>
          </div>

          <div class="section-title">Commands (click to learn)</div>
          <div class="command-grid">
            ${this._getCommandsForType(profile.device_type).map(cmd => `
              <button class="command-btn ${learnedCommands.includes(cmd) ? 'learned' : ''}"
                      data-action="learn-command" data-command="${cmd}">
                ${this._formatCommand(cmd)}
                ${learnedCommands.includes(cmd) ? ' ✓' : ''}
              </button>
            `).join('')}
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" data-action="close-modal">Done</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderEditPortModal() {
    const port = this._ports.find(p => p.port === this._modal.port);
    if (!port) return '';

    const gpioPin = this._gpioPins.find(p => p.gpio === port.port || p.gpio === port.gpio);
    const assignments = this._portAssignments[port.port] || [];
    const isInputOnly = gpioPin && !gpioPin.can_output;

    return `
      <div class="modal" data-action="close-modal">
        <div class="modal-content" onclick="event.stopPropagation()">
          <div class="modal-title">Configure Port ${port.port}</div>

          ${gpioPin ? `
            <div style="padding: 12px; background: var(--secondary-background-color, #f5f5f5); border-radius: 8px; margin-bottom: 16px;">
              <div style="font-weight: 600; color: var(--primary-text-color);">${gpioPin.name}</div>
              <div style="font-size: 12px; color: var(--secondary-text-color); margin-top: 4px;">${gpioPin.notes}</div>
              ${isInputOnly ? `
                <div style="font-size: 11px; color: var(--warning-color, #ff9800); margin-top: 8px;">
                  ⚠️ This GPIO is input-only and can only be used as an IR receiver.
                </div>
              ` : ''}
            </div>
          ` : ''}

          <div class="form-group">
            <label>Mode</label>
            <select id="port-mode">
              ${!isInputOnly ? `<option value="ir_output" ${port.mode === 'ir_output' ? 'selected' : ''}>IR Output (Transmitter)</option>` : ''}
              <option value="ir_input" ${port.mode === 'ir_input' ? 'selected' : ''}>IR Input (Receiver/Learning)</option>
              <option value="disabled" ${port.mode === 'disabled' ? 'selected' : ''}>Disabled</option>
            </select>
          </div>

          <div class="form-group">
            <label>Name</label>
            <input type="text" id="port-name" value="${port.name || ''}" placeholder="e.g., Bar TV 1">
          </div>

          ${assignments.length > 0 ? `
            <div style="margin-top: 16px;">
              <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--primary-text-color);">
                Assigned Devices (${assignments.length})
              </label>
              <div style="background: var(--secondary-background-color, #f5f5f5); border-radius: 8px; padding: 8px;">
                ${assignments.map(a => `
                  <div style="padding: 8px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--divider-color, #e0e0e0);">
                    <div>
                      <div style="font-weight: 500; color: var(--primary-text-color);">${a.name}</div>
                      <div style="font-size: 11px; color: var(--secondary-text-color);">${a.location || 'No location'}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
              <div style="font-size: 11px; color: var(--secondary-text-color); margin-top: 8px;">
                Multiple devices can share the same IR output port if they're in the same location.
              </div>
            </div>
          ` : ''}

          <div class="modal-actions">
            <button class="btn btn-secondary" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" data-action="save-port" data-port="${port.port}">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderRemoteControlModal() {
    const device = this._devices.find(d => d.device_id === this._modal.deviceId);
    if (!device) return '';

    // Get commands based on profile type
    const profileId = device.device_profile_id;
    let commands = [];
    let profileName = '';
    let protocol = '';

    if (profileId.startsWith('builtin:')) {
      const builtinId = profileId.substring(8);
      const profile = this._builtinProfiles.find(p => p.profile_id === builtinId);
      if (profile) {
        commands = Object.keys(profile.codes || {});
        profileName = profile.name;
        protocol = profile.protocol;
      }
    } else {
      const profile = this._profiles.find(p => p.profile_id === profileId);
      if (profile) {
        commands = profile.learned_commands || [];
        profileName = profile.name;
      }
    }

    // Group commands by category
    const powerCmds = commands.filter(c => c.includes('power'));
    const volCmds = commands.filter(c => c.includes('volume') || c === 'mute');
    const chanCmds = commands.filter(c => c.includes('channel'));
    const navCmds = commands.filter(c => ['up', 'down', 'left', 'right', 'enter', 'select', 'back', 'exit', 'menu', 'home', 'guide', 'info'].includes(c));
    const numCmds = commands.filter(c => /^[0-9]$/.test(c) || c.includes('digit'));
    const inputCmds = commands.filter(c => c.includes('hdmi') || c.includes('source') || c.includes('input') || c.includes('av') || c.includes('component'));
    const playCmds = commands.filter(c => ['play', 'pause', 'play_pause', 'stop', 'rewind', 'fast_forward', 'record', 'replay', 'skip_prev', 'skip_next'].includes(c));
    const otherCmds = commands.filter(c =>
      !powerCmds.includes(c) && !volCmds.includes(c) && !chanCmds.includes(c) &&
      !navCmds.includes(c) && !numCmds.includes(c) && !inputCmds.includes(c) && !playCmds.includes(c)
    );

    return `
      <div class="modal" data-action="close-modal">
        <div class="modal-content" onclick="event.stopPropagation()" style="max-width: 450px;">
          <div class="modal-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>Remote: ${device.name}</span>
            <span class="badge badge-info">${profileName}</span>
          </div>

          ${protocol ? `<div style="font-size: 11px; color: var(--secondary-text-color); margin-bottom: 16px;">Protocol: ${protocol}</div>` : ''}

          ${this._modal.lastSent ? `
            <div style="padding: 8px 12px; background: var(--success-color, #4caf50); color: white; border-radius: 6px; margin-bottom: 16px; text-align: center; font-size: 13px;">
              Sent: ${this._formatCommand(this._modal.lastSent)}
            </div>
          ` : ''}

          <div class="remote-layout" style="display: flex; flex-direction: column; gap: 16px;">

            <!-- Power -->
            ${powerCmds.length > 0 ? `
              <div class="remote-section">
                <div style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;">
                  ${powerCmds.map(cmd => `
                    <button class="remote-btn power" data-action="send-remote-cmd" data-command="${cmd}">
                      ${cmd === 'power' ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"/></svg>' : cmd === 'power_on' ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"/></svg> On' : cmd === 'power_off' ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"/></svg> Off' : this._formatCommand(cmd)}
                    </button>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Navigation D-pad -->
            ${navCmds.length > 0 ? `
              <div class="remote-section">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; max-width: 180px; margin: 0 auto;">
                  <div></div>
                  ${navCmds.includes('up') ? `<button class="remote-btn nav" data-action="send-remote-cmd" data-command="up"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg></button>` : '<div></div>'}
                  <div></div>
                  ${navCmds.includes('left') ? `<button class="remote-btn nav" data-action="send-remote-cmd" data-command="left"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></button>` : '<div></div>'}
                  ${navCmds.includes('select') || navCmds.includes('enter') ? `<button class="remote-btn nav ok" data-action="send-remote-cmd" data-command="${navCmds.includes('select') ? 'select' : 'enter'}">OK</button>` : '<div></div>'}
                  ${navCmds.includes('right') ? `<button class="remote-btn nav" data-action="send-remote-cmd" data-command="right"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg></button>` : '<div></div>'}
                  <div></div>
                  ${navCmds.includes('down') ? `<button class="remote-btn nav" data-action="send-remote-cmd" data-command="down"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg></button>` : '<div></div>'}
                  <div></div>
                </div>
                <div style="display: flex; justify-content: center; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                  ${navCmds.filter(c => !['up','down','left','right','select','enter'].includes(c)).map(cmd => `
                    <button class="remote-btn" data-action="send-remote-cmd" data-command="${cmd}">${this._formatCommand(cmd)}</button>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Volume & Channel -->
            ${volCmds.length > 0 || chanCmds.length > 0 ? `
              <div class="remote-section" style="display: flex; justify-content: space-around;">
                ${volCmds.length > 0 ? `
                  <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <span style="font-size: 11px; color: var(--secondary-text-color);">Volume</span>
                    ${volCmds.includes('volume_up') ? `<button class="remote-btn vol" data-action="send-remote-cmd" data-command="volume_up">+</button>` : ''}
                    ${volCmds.includes('mute') ? `<button class="remote-btn vol mute" data-action="send-remote-cmd" data-command="mute"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg></button>` : ''}
                    ${volCmds.includes('volume_down') ? `<button class="remote-btn vol" data-action="send-remote-cmd" data-command="volume_down">−</button>` : ''}
                  </div>
                ` : ''}
                ${chanCmds.length > 0 ? `
                  <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <span style="font-size: 11px; color: var(--secondary-text-color);">Channel</span>
                    ${chanCmds.includes('channel_up') ? `<button class="remote-btn chan" data-action="send-remote-cmd" data-command="channel_up"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg></button>` : ''}
                    ${chanCmds.includes('channel_down') ? `<button class="remote-btn chan" data-action="send-remote-cmd" data-command="channel_down"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg></button>` : ''}
                  </div>
                ` : ''}
              </div>
            ` : ''}

            <!-- Number Pad -->
            ${numCmds.length > 0 ? `
              <div class="remote-section">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; max-width: 180px; margin: 0 auto;">
                  ${['1','2','3','4','5','6','7','8','9','','0',''].map(n => {
                    if (n === '') return '<div></div>';
                    const cmd = numCmds.find(c => c === n || c === `digit_${n}` || c.endsWith(n));
                    return cmd ? `<button class="remote-btn num" data-action="send-remote-cmd" data-command="${cmd}">${n}</button>` : '<div></div>';
                  }).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Input Selection -->
            ${inputCmds.length > 0 ? `
              <div class="remote-section">
                <div style="font-size: 11px; color: var(--secondary-text-color); margin-bottom: 8px; text-align: center;">Inputs</div>
                <div style="display: flex; justify-content: center; gap: 6px; flex-wrap: wrap;">
                  ${inputCmds.map(cmd => `
                    <button class="remote-btn input" data-action="send-remote-cmd" data-command="${cmd}">${this._formatCommand(cmd)}</button>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Playback Controls -->
            ${playCmds.length > 0 ? `
              <div class="remote-section">
                <div style="display: flex; justify-content: center; gap: 6px; flex-wrap: wrap;">
                  ${playCmds.includes('rewind') ? `<button class="remote-btn play" data-action="send-remote-cmd" data-command="rewind"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg></button>` : ''}
                  ${playCmds.includes('play') ? `<button class="remote-btn play" data-action="send-remote-cmd" data-command="play"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>` : ''}
                  ${playCmds.includes('play_pause') ? `<button class="remote-btn play" data-action="send-remote-cmd" data-command="play_pause"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>` : ''}
                  ${playCmds.includes('pause') ? `<button class="remote-btn play" data-action="send-remote-cmd" data-command="pause"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg></button>` : ''}
                  ${playCmds.includes('stop') ? `<button class="remote-btn play" data-action="send-remote-cmd" data-command="stop"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 6h12v12H6z"/></svg></button>` : ''}
                  ${playCmds.includes('fast_forward') ? `<button class="remote-btn play" data-action="send-remote-cmd" data-command="fast_forward"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg></button>` : ''}
                  ${playCmds.includes('record') ? `<button class="remote-btn play record" data-action="send-remote-cmd" data-command="record"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg></button>` : ''}
                </div>
              </div>
            ` : ''}

            <!-- Other Commands -->
            ${otherCmds.length > 0 ? `
              <div class="remote-section">
                <div style="font-size: 11px; color: var(--secondary-text-color); margin-bottom: 8px; text-align: center;">Other</div>
                <div style="display: flex; justify-content: center; gap: 6px; flex-wrap: wrap;">
                  ${otherCmds.map(cmd => `
                    <button class="remote-btn" data-action="send-remote-cmd" data-command="${cmd}">${this._formatCommand(cmd)}</button>
                  `).join('')}
                </div>
              </div>
            ` : ''}

          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" data-action="close-modal">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  _getCommandsForType(deviceType) {
    const commands = {
      cable_box: [
        'power_on', 'power_off', 'power_toggle',
        'digit_0', 'digit_1', 'digit_2', 'digit_3', 'digit_4',
        'digit_5', 'digit_6', 'digit_7', 'digit_8', 'digit_9',
        'channel_up', 'channel_down', 'channel_enter', 'channel_prev',
        'volume_up', 'volume_down', 'mute',
        'guide', 'menu', 'info', 'exit', 'back',
        'arrow_up', 'arrow_down', 'arrow_left', 'arrow_right', 'select',
        'play', 'pause', 'stop', 'rewind', 'fast_forward', 'record',
      ],
      tv: [
        'power_on', 'power_off', 'power_toggle',
        'volume_up', 'volume_down', 'mute',
        'input_hdmi1', 'input_hdmi2', 'input_hdmi3', 'input_hdmi4',
        'input_component', 'input_composite', 'input_antenna', 'input_cycle',
        'menu', 'exit', 'arrow_up', 'arrow_down', 'arrow_left', 'arrow_right', 'select',
      ],
      audio_receiver: [
        'power_on', 'power_off', 'power_toggle',
        'volume_up', 'volume_down', 'mute',
        'input_hdmi1', 'input_hdmi2', 'input_optical', 'input_bluetooth', 'input_cycle',
      ],
      streaming_device: [
        'power_on', 'power_off', 'power_toggle',
        'home', 'menu', 'back',
        'arrow_up', 'arrow_down', 'arrow_left', 'arrow_right', 'select',
        'play', 'pause', 'play_pause', 'rewind', 'fast_forward',
      ],
      dvd_bluray: [
        'power_on', 'power_off', 'power_toggle', 'eject',
        'play', 'pause', 'stop', 'rewind', 'fast_forward', 'skip_prev', 'skip_next',
        'menu', 'title_menu', 'popup_menu',
        'arrow_up', 'arrow_down', 'arrow_left', 'arrow_right', 'select',
      ],
      projector: [
        'power_on', 'power_off', 'power_toggle',
        'input_hdmi1', 'input_hdmi2', 'input_vga', 'input_cycle',
        'menu', 'exit', 'freeze', 'blank',
      ],
      custom: ['power_toggle'],
    };
    return commands[deviceType] || commands.custom;
  }

  _formatCommand(cmd) {
    return cmd.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  _renderMatrixLinkSection() {
    // Serial devices that could be matrices
    const matrixDevices = [
      ...this._serialDevices.map(d => ({ ...d, type: 'serial' })),
    ];

    if (matrixDevices.length === 0) {
      return `
        <div style="margin-top: 16px; padding: 12px; background: var(--secondary-background-color, #f5f5f5); border-radius: 8px;">
          <div style="font-weight: 500; color: var(--secondary-text-color);">Link to HDMI Matrix (Optional)</div>
          <div style="font-size: 12px; color: var(--secondary-text-color); margin-top: 4px;">
            No serial devices configured. Add a matrix device in the Serial tab first.
          </div>
        </div>
      `;
    }

    return `
      <div style="margin-top: 16px; padding: 12px; background: var(--secondary-background-color, #f5f5f5); border-radius: 8px;">
        <div class="form-group" style="margin-bottom: 8px;">
          <label><input type="checkbox" id="device-link-matrix" data-action="toggle-matrix-link" style="margin-right: 8px; vertical-align: middle;" />Link to HDMI Matrix</label>
          <small>Connect this device to an HDMI matrix</small>
        </div>
        <div id="matrix-link-options" style="display: none;">
          <div class="form-group">
            <label>Matrix Device</label>
            <select id="device-matrix-id" data-action="matrix-device-changed">
              <option value="">Select a matrix...</option>
              ${matrixDevices.map(d => `
                <option value="${d.device_id}" data-type="${d.type}">${d.name} (${d.type === 'network' ? 'Network' : 'Serial'})</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Device Type</label>
            <select id="device-matrix-type" data-action="matrix-type-changed">
              <option value="input">Input Device (Source: Cable Box, Streaming, etc.)</option>
              <option value="output">Output Device (Display: TV, Projector, etc.)</option>
            </select>
          </div>
          <div class="form-group">
            <label id="matrix-port-label">Matrix Input</label>
            <select id="device-matrix-port">
              <option value="">Select port...</option>
            </select>
            <small id="matrix-port-help">Which matrix input is this device connected to?</small>
          </div>
        </div>
      </div>
    `;
  }

  _getMatrixOutputOptions(matrixDevice) {
    // Get input commands (is_input_option=true) from the matrix device
    // These represent available inputs that can be routed to outputs
    const commands = matrixDevice.commands || {};
    const inputCommands = Object.values(commands).filter(cmd => cmd.is_input_option);

    // For now, provide generic output options 1-8
    // In a real implementation, this could be based on the device type
    const outputs = [];
    for (let i = 1; i <= 8; i++) {
      outputs.push({ value: String(i), label: `Output ${i}` });
    }
    return outputs;
  }

  async _updateMatrixPortOptions(matrixDeviceId) {
    const portSelect = this.shadowRoot.getElementById('device-matrix-port');
    const typeSelect = this.shadowRoot.getElementById('device-matrix-type');
    const portLabel = this.shadowRoot.getElementById('matrix-port-label');
    const portHelp = this.shadowRoot.getElementById('matrix-port-help');

    if (!portSelect) return;

    const isInput = typeSelect?.value === 'input';

    // Update labels based on device type
    if (portLabel) {
      portLabel.textContent = isInput ? 'Matrix Input' : 'Matrix Output';
    }
    if (portHelp) {
      portHelp.textContent = isInput
        ? 'Which matrix input is this source device connected to?'
        : 'Which matrix output is this display connected to?';
    }

    if (!matrixDeviceId) {
      portSelect.innerHTML = '<option value="">Select matrix first...</option>';
      return;
    }

    // Find the matrix device to get its type
    const matrixIdSelect = this.shadowRoot.getElementById('device-matrix-id');
    const selectedOption = matrixIdSelect?.options[matrixIdSelect.selectedIndex];
    const matrixType = selectedOption?.dataset.type;

    // Fetch matrix device to get actual port names
    try {
      const endpoint = matrixType === 'network'
        ? `/api/vda_ir_control/network_devices/${matrixDeviceId}`
        : `/api/vda_ir_control/serial_devices/${matrixDeviceId}`;

      const resp = await fetch(endpoint, {
        headers: { 'Authorization': `Bearer ${this._hass.auth.data.access_token}` },
      });

      if (resp.ok) {
        const device = await resp.json();
        const ports = isInput ? (device.matrix_inputs || []) : (device.matrix_outputs || []);
        const portType = isInput ? 'Input' : 'Output';

        if (ports.length > 0) {
          let html = `<option value="">Select ${portType.toLowerCase()}...</option>`;
          ports.forEach(p => {
            html += `<option value="${p.index}">${p.name || portType + ' ' + p.index}</option>`;
          });
          portSelect.innerHTML = html;
          return;
        }
      }
    } catch (e) {
      console.error('Failed to fetch matrix ports:', e);
    }

    // Fallback to generic options 1-8
    const portType = isInput ? 'Input' : 'Output';
    let html = `<option value="">Select ${portType.toLowerCase()}...</option>`;
    for (let i = 1; i <= 8; i++) {
      html += `<option value="${i}">${portType} ${i}</option>`;
    }
    portSelect.innerHTML = html;
  }

  _renderCreateNetworkDeviceModal() {
    const driver = this._modal?.driver;
    const discovered = this._modal?.discoveredDevice;

    // If discovered device, try to match with a driver
    let matchedDriver = null;
    if (discovered && discovered.suggested_driver_id) {
      matchedDriver = this._networkDrivers.find(d => d.driver_id === discovered.suggested_driver_id);
    }

    // Use matched driver if available, otherwise use explicitly selected driver
    const activeDriver = matchedDriver || driver;

    const conn = activeDriver?.connection || {};
    const matrixCfg = activeDriver?.matrix_config || {};
    const defaultPort = discovered?.port || conn.default_port || 8000;
    const defaultProtocol = discovered?.protocol || conn.protocol || 'tcp';
    const deviceType = activeDriver?.device_type || 'hdmi_matrix';
    const isMatrix = deviceType === 'hdmi_matrix';
    const inputCount = matrixCfg.input_count || 4;
    const outputCount = matrixCfg.output_count || 4;
    const routingTemplate = matrixCfg.routing_command_template || '';
    const defaultLineEnding = activeDriver?.communication?.default_line_ending || 'crlf';
    const commandCount = activeDriver?.commands ? Object.keys(activeDriver.commands).length : 0;

    // Pre-fill values from discovered device
    const defaultName = discovered?.name || (activeDriver ? activeDriver.name : '');
    const defaultHost = discovered?.ip_address || '';
    const defaultDeviceId = discovered ? defaultName.toLowerCase().replace(/[^a-z0-9]/g, '_') : '';

    return `
      <div class="modal" data-action="close-modal">
        <div class="modal-content" onclick="event.stopPropagation()" style="max-width: 500px;">
          <div class="modal-header">
            <h3>${discovered ? `Add ${defaultName}` : activeDriver ? `Add ${activeDriver.name}` : 'Add Network Device'}</h3>
            <button class="modal-close" data-action="close-modal">&times;</button>
          </div>
          <div class="modal-body">
            ${activeDriver ? `
              <div style="margin-bottom: 16px; padding: 12px; background: var(--primary-color); color: white; border-radius: 8px;">
                <div style="font-weight: 500; margin-bottom: 4px;">${activeDriver.name}</div>
                <div style="font-size: 12px; opacity: 0.9;">
                  ${activeDriver.manufacturer || 'Generic'} • ${deviceType.replace('_', ' ')} • Port ${defaultPort} (${defaultProtocol.toUpperCase()})
                </div>
                <div style="font-size: 11px; opacity: 0.8; margin-top: 4px;">
                  ${commandCount} commands will be auto-configured${discovered ? ' • Auto-discovered' : ''}
                </div>
                <input type="hidden" id="network-device-driver-id" value="${activeDriver.driver_id}" />
                <input type="hidden" id="network-device-port" value="${defaultPort}" />
                <input type="hidden" id="network-device-protocol" value="${defaultProtocol}" />
                <input type="hidden" id="network-device-type" value="${deviceType}" />
              </div>
              <div class="form-group">
                <label>Device ID</label>
                <input type="text" id="network-device-id" placeholder="${activeDriver.driver_id}_1" value="${defaultDeviceId}" />
                <small>Unique identifier (lowercase, underscores ok)</small>
              </div>
              <div class="form-group">
                <label>Name</label>
                <input type="text" id="network-device-name" placeholder="${activeDriver.name}" value="${defaultName}" />
              </div>
              <div class="form-group">
                <label>IP Address</label>
                <input type="text" id="network-device-host" placeholder="192.168.1.100" value="${defaultHost}" />
              </div>
              <div class="form-group">
                <label>Location (optional)</label>
                <input type="text" id="network-device-location" placeholder="Living Room" />
              </div>
            ` : `
              <div class="form-group">
                <label>Device ID</label>
                <input type="text" id="network-device-id" placeholder="my_device_1" />
                <small>Unique identifier (lowercase, underscores ok)</small>
              </div>
              <div class="form-group">
                <label>Name</label>
                <input type="text" id="network-device-name" placeholder="My Device" />
              </div>
              <div class="form-group">
                <label>Device Type</label>
                <select id="network-device-type" data-action="network-device-type-changed">
                  <option value="hdmi_matrix">HDMI Matrix</option>
                  <option value="hdmi_switch">HDMI Switch</option>
                  <option value="projector">Projector</option>
                  <option value="audio_receiver">Audio Receiver</option>
                  <option value="av_processor">AV Processor</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div class="form-group">
                <label>IP Address</label>
                <input type="text" id="network-device-host" placeholder="192.168.1.100" />
              </div>
              <div style="display: flex; gap: 12px;">
                <div class="form-group" style="flex: 1;">
                  <label>Port</label>
                  <input type="number" id="network-device-port" value="8000" min="1" max="65535" />
                </div>
                <div class="form-group" style="flex: 1;">
                  <label>Protocol</label>
                  <select id="network-device-protocol">
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label>Location (optional)</label>
                <input type="text" id="network-device-location" placeholder="Living Room" />
              </div>

              <!-- Matrix Configuration (shown when device type is hdmi_matrix) -->
              <div id="matrix-config-section" style="margin-top: 16px; padding: 12px; background: var(--secondary-background-color); border-radius: 8px;">
                <div style="font-weight: 500; margin-bottom: 12px;">Matrix Configuration</div>
                <div style="display: flex; gap: 16px;">
                  <div class="form-group" style="flex: 1;">
                    <label>Inputs</label>
                    <select id="matrix-input-count" data-action="matrix-config-changed">
                      ${[2,4,6,8,10,12,16].map(n => `<option value="${n}" ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group" style="flex: 1;">
                    <label>Outputs</label>
                    <select id="matrix-output-count" data-action="matrix-config-changed">
                      ${[2,4,6,8,10,12,16].map(n => `<option value="${n}" ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                  </div>
                </div>
                <div class="form-group" style="margin-top: 12px;">
                  <label>Routing Command</label>
                  <input type="text" id="matrix-command-template" placeholder="s cir {input} {output}!" style="font-family: monospace;" />
                  <small>Use {input} and {output} placeholders</small>
                </div>
                <div class="form-group" style="margin-top: 8px;">
                  <label>Line Ending</label>
                  <select id="matrix-command-line-ending">
                    <option value="none">None</option>
                    <option value="cr">CR</option>
                    <option value="lf">LF</option>
                    <option value="crlf" selected>CRLF</option>
                  </select>
                </div>
              </div>
            `}
            <div style="margin-top: 16px;">
              <button class="btn btn-secondary" data-action="test-connection">Test Connection</button>
              <span id="test-connection-result" style="margin-left: 8px; font-size: 12px;"></span>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" data-action="save-network-device">${driver ? 'Create Device' : 'Create Device'}</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderMatrixIONames(inputCount, outputCount) {
    return `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <div style="font-size: 12px; font-weight: 500; margin-bottom: 8px; color: var(--secondary-text-color);">Input Names</div>
          ${Array.from({length: inputCount}, (_, i) => `
            <div style="margin-bottom: 4px;">
              <input type="text" class="matrix-input-name" data-index="${i+1}"
                     placeholder="Input ${i+1}" value="HDMI ${i+1}"
                     style="width: 100%; padding: 6px 8px; font-size: 12px;" />
            </div>
          `).join('')}
        </div>
        <div>
          <div style="font-size: 12px; font-weight: 500; margin-bottom: 8px; color: var(--secondary-text-color);">Output Names</div>
          ${Array.from({length: outputCount}, (_, i) => `
            <div style="margin-bottom: 4px;">
              <input type="text" class="matrix-output-name" data-index="${i+1}"
                     placeholder="Output ${i+1}" value="Output ${i+1}"
                     style="width: 100%; padding: 6px 8px; font-size: 12px;" />
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  _toggleMatrixConfigSection(deviceType) {
    const section = this.shadowRoot.getElementById('matrix-config-section');
    if (section) {
      section.style.display = (deviceType === 'hdmi_matrix') ? 'block' : 'none';
    }
  }

  _updateMatrixIONames() {
    const inputCount = parseInt(this.shadowRoot.getElementById('matrix-input-count')?.value || 4);
    const outputCount = parseInt(this.shadowRoot.getElementById('matrix-output-count')?.value || 4);
    const container = this.shadowRoot.getElementById('matrix-io-names');
    if (container) {
      container.innerHTML = this._renderMatrixIONames(inputCount, outputCount);
    }
  }

  _getMatrixConfig() {
    const deviceType = this.shadowRoot.getElementById('network-device-type')?.value;
    if (deviceType !== 'hdmi_matrix') return null;

    const inputNames = [];
    const outputNames = [];

    this.shadowRoot.querySelectorAll('.matrix-input-name').forEach(input => {
      inputNames.push({
        index: parseInt(input.dataset.index),
        name: input.value || `HDMI ${input.dataset.index}`
      });
    });

    this.shadowRoot.querySelectorAll('.matrix-output-name').forEach(input => {
      outputNames.push({
        index: parseInt(input.dataset.index),
        name: input.value || `Output ${input.dataset.index}`
      });
    });

    const commandTemplate = this.shadowRoot.getElementById('matrix-command-template')?.value || '';
    const lineEnding = this.shadowRoot.getElementById('matrix-command-line-ending')?.value || 'crlf';
    const statusCommand = this.shadowRoot.getElementById('matrix-status-command')?.value || '';

    return {
      inputs: inputNames,
      outputs: outputNames,
      command_template: commandTemplate,
      line_ending: lineEnding,
      status_command: statusCommand
    };
  }

  _renderAddNetworkCommandModal() {
    const deviceId = this._modal?.deviceId;
    return `
      <div class="modal" data-action="close-modal">
        <div class="modal-content" onclick="event.stopPropagation()" style="max-width: 550px;">
          <div class="modal-header">
            <h3>Add Command</h3>
            <button class="modal-close" data-action="close-modal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Command ID</label>
              <input type="text" id="command-id" placeholder="power_on" />
              <small>Unique identifier (lowercase, underscores ok)</small>
            </div>
            <div class="form-group">
              <label>Name</label>
              <input type="text" id="command-name" placeholder="Power On" />
            </div>
            <div class="form-group">
              <label>Payload</label>
              <input type="text" id="command-payload" placeholder="s power 1" />
              <small>The command to send (text or hex)</small>
            </div>
            <div style="display: flex; gap: 16px;">
              <div class="form-group" style="flex: 1;">
                <label>Format</label>
                <select id="command-format">
                  <option value="text">Text</option>
                  <option value="hex">Hex</option>
                </select>
              </div>
              <div class="form-group" style="flex: 1;">
                <label>Line Ending</label>
                <select id="command-line-ending">
                  <option value="none">None</option>
                  <option value="!">! (Exclamation)</option>
                  <option value="cr">CR</option>
                  <option value="lf">LF</option>
                  <option value="crlf">CRLF</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label><input type="checkbox" id="command-is-input" style="margin-right: 8px; vertical-align: middle;" />Input selection</label>
              <small>Check if this selects an input (HDMI 1, HDMI 2, etc.)</small>
            </div>
            <div class="form-group" id="input-value-group" style="display: none;">
              <label>Input Value</label>
              <input type="text" id="command-input-value" placeholder="1" />
              <small>The value this input represents (e.g., "1" for HDMI 1)</small>
            </div>
            <div class="form-group">
              <label><input type="checkbox" id="command-is-query" style="margin-right: 8px; vertical-align: middle;" />Query command</label>
              <small>Check if this queries device state</small>
            </div>
            <div class="form-group" id="response-pattern-group" style="display: none;">
              <label>Response Pattern (regex)</label>
              <input type="text" id="command-response-pattern" placeholder="input (\\d+)" />
              <small>Regex to extract state from response</small>
            </div>
            <div class="form-group" id="state-key-group" style="display: none;">
              <label>State Key</label>
              <input type="text" id="command-state-key" placeholder="current_input" />
              <small>Which state this updates (current_input, power, etc.)</small>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" data-action="save-network-command" data-device-id="${deviceId}">Add Command</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderCreateSerialDeviceModal() {
    const boards = this._getBoards();
    return `
      <div class="modal" data-action="close-modal">
        <div class="modal-content" onclick="event.stopPropagation()" style="max-width: 550px;">
          <div class="modal-header">
            <h3>Add Serial Device</h3>
            <button class="modal-close" data-action="close-modal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Device ID</label>
              <input type="text" id="serial-device-id" placeholder="hdmi_matrix_1" />
              <small>Unique identifier (lowercase, underscores ok)</small>
            </div>
            <div class="form-group">
              <label>Name</label>
              <input type="text" id="serial-device-name" placeholder="HDMI Matrix" />
            </div>
            <div class="form-group">
              <label>Device Profile (optional)</label>
              <select id="serial-device-profile" data-action="serial-profile-changed">
                <option value="">-- No profile (configure manually) --</option>
                ${this._serialProfiles.map(p => `
                  <option value="${p.profile_id}" data-baud="${p.baud_rate}" data-type="${p.device_type}">
                    ${p.name} (${p.manufacturer})
                  </option>
                `).join('')}
              </select>
              <small>Select a profile to auto-configure serial settings and commands</small>
            </div>
            <div class="form-group">
              <label>Connection Mode</label>
              <select id="serial-device-mode" data-action="serial-mode-changed">
                <option value="direct">Direct (USB/Serial on Home Assistant)</option>
                <option value="bridge">ESP32 Bridge (via IR Board)</option>
              </select>
            </div>

            <!-- Direct mode fields -->
            <div id="serial-direct-fields">
              <div class="form-group">
                <label>Serial Port</label>
                <select id="serial-device-port">
                  ${this._availableSerialPorts.length === 0 ? `
                    <option value="">No ports found - enter manually</option>
                  ` : this._availableSerialPorts.map(p => `
                    <option value="${p.device}">${p.device} ${p.description ? `(${p.description})` : ''}</option>
                  `).join('')}
                </select>
                <input type="text" id="serial-device-port-manual" placeholder="/dev/ttyUSB0" style="margin-top: 4px;" />
                <small>Select from list or enter path manually</small>
              </div>
            </div>

            <!-- Bridge mode fields -->
            <div id="serial-bridge-fields" style="display: none;">
              <div class="form-group">
                <label>ESP32 Board</label>
                <select id="serial-device-board">
                  ${boards.map(b => `
                    <option value="${b.board_id}">${b.board_name} (${b.ip_address})</option>
                  `).join('')}
                  ${boards.length === 0 ? '<option value="">No boards available</option>' : ''}
                </select>
              </div>
              <div style="display: flex; gap: 16px;">
                <div class="form-group" style="flex: 1;">
                  <label>UART Number</label>
                  <select id="serial-device-uart">
                    <option value="1">UART 1</option>
                    <option value="2">UART 2</option>
                  </select>
                </div>
                <div class="form-group" style="flex: 1;">
                  <label>RX Pin (GPIO)</label>
                  <input type="number" id="serial-device-rx-pin" value="9" min="0" max="39" />
                </div>
                <div class="form-group" style="flex: 1;">
                  <label>TX Pin (GPIO)</label>
                  <input type="number" id="serial-device-tx-pin" value="10" min="0" max="39" />
                </div>
              </div>
              <small style="color: var(--secondary-text-color);">
                Olimex POE-ISO: UART1 RX=9, TX=10 | DevKit: UART1 RX=16, TX=17 or UART2 RX=25, TX=26
              </small>
            </div>

            <!-- Common fields -->
            <div style="display: flex; gap: 16px; margin-top: 16px;">
              <div class="form-group" style="flex: 1;">
                <label>Baud Rate</label>
                <select id="serial-device-baud">
                  <option value="9600">9600</option>
                  <option value="19200">19200</option>
                  <option value="38400">38400</option>
                  <option value="57600">57600</option>
                  <option value="115200" selected>115200</option>
                  <option value="230400">230400</option>
                </select>
              </div>
              <div class="form-group" style="flex: 1;">
                <label>Data Bits</label>
                <select id="serial-device-data-bits">
                  <option value="7">7</option>
                  <option value="8" selected>8</option>
                </select>
              </div>
            </div>
            <div style="display: flex; gap: 16px;">
              <div class="form-group" style="flex: 1;">
                <label>Parity</label>
                <select id="serial-device-parity">
                  <option value="N" selected>None</option>
                  <option value="E">Even</option>
                  <option value="O">Odd</option>
                </select>
              </div>
              <div class="form-group" style="flex: 1;">
                <label>Stop Bits</label>
                <select id="serial-device-stop-bits">
                  <option value="1" selected>1</option>
                  <option value="2">2</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Device Type</label>
              <select id="serial-device-type">
                <option value="hdmi_matrix">HDMI Matrix</option>
                <option value="hdmi_switch">HDMI Switch</option>
                <option value="av_processor">AV Processor</option>
                <option value="projector">Projector</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div class="form-group">
              <label>Location (optional)</label>
              <input type="text" id="serial-device-location" placeholder="Living Room" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" data-action="save-serial-device">Create Device</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderAddSerialCommandModal() {
    const deviceId = this._modal?.deviceId;
    return `
      <div class="modal" data-action="close-modal">
        <div class="modal-content" onclick="event.stopPropagation()" style="max-width: 550px;">
          <div class="modal-header">
            <h3>Add Serial Command</h3>
            <button class="modal-close" data-action="close-modal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Command ID</label>
              <input type="text" id="serial-command-id" placeholder="power_on" />
              <small>Unique identifier (lowercase, underscores ok)</small>
            </div>
            <div class="form-group">
              <label>Name</label>
              <input type="text" id="serial-command-name" placeholder="Power On" />
            </div>
            <div class="form-group">
              <label>Payload</label>
              <input type="text" id="serial-command-payload" placeholder="PWR ON" />
              <small>The command to send (text or hex)</small>
            </div>
            <div style="display: flex; gap: 16px;">
              <div class="form-group" style="flex: 1;">
                <label>Format</label>
                <select id="serial-command-format">
                  <option value="text">Text</option>
                  <option value="hex">Hex</option>
                </select>
              </div>
              <div class="form-group" style="flex: 1;">
                <label>Line Ending</label>
                <select id="serial-command-line-ending">
                  <option value="none">None</option>
                  <option value="!">! (Exclamation)</option>
                  <option value="cr">CR</option>
                  <option value="lf">LF</option>
                  <option value="crlf" selected>CRLF</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label><input type="checkbox" id="serial-command-is-input" style="margin-right: 8px; vertical-align: middle;" />Input selection</label>
              <small>Check if this selects an input (HDMI 1, HDMI 2, etc.)</small>
            </div>
            <div class="form-group" id="serial-input-value-group" style="display: none;">
              <label>Input Value</label>
              <input type="text" id="serial-command-input-value" placeholder="1" />
              <small>The value this input represents (e.g., "1" for HDMI 1)</small>
            </div>
            <div class="form-group">
              <label><input type="checkbox" id="serial-command-is-query" style="margin-right: 8px; vertical-align: middle;" />Query command</label>
              <small>Check if this queries device state</small>
            </div>
            <div class="form-group" id="serial-response-pattern-group" style="display: none;">
              <label>Response Pattern (regex)</label>
              <input type="text" id="serial-command-response-pattern" placeholder="INPUT:(\\d+)" />
              <small>Regex to extract state from response</small>
            </div>
            <div class="form-group" id="serial-state-key-group" style="display: none;">
              <label>State Key</label>
              <input type="text" id="serial-command-state-key" placeholder="current_input" />
              <small>Which state this updates (current_input, power, etc.)</small>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" data-action="save-serial-command" data-device-id="${deviceId}">Add Command</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderEditMatrixIOModal() {
    const matrixDevice = this._modal?.matrixDevice;
    if (!matrixDevice) return '';

    const matrixInputs = matrixDevice.matrix_inputs || [];
    const matrixOutputs = matrixDevice.matrix_outputs || [];

    // Get all controlled devices for the dropdowns (IR devices, serial devices, and HA devices)
    const irDevices = (this._devices || []).map(d => ({ ...d, _type: 'ir' }));
    // Serial devices (exclude matrix devices - they can't be inputs/outputs of themselves)
    const serialDevicesForDropdown = (this._serialDevices || [])
      .filter(d => d.device_type !== 'hdmi_matrix')
      .map(d => ({ ...d, _type: 'serial' }));
    const haDevices = (this._haDevices || []).map(d => ({ ...d, _type: 'ha' }));
    const availableDevices = [...irDevices, ...serialDevicesForDropdown, ...haDevices];

    return `
      <div class="modal" data-action="close-modal">
        <div class="modal-content" onclick="event.stopPropagation()" style="max-width: 600px;">
          <div class="modal-header">
            <h3>Edit Matrix I/O: ${matrixDevice.name}</h3>
            <button class="modal-close" data-action="close-modal">&times;</button>
          </div>
          <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
            <p style="color: var(--secondary-text-color); font-size: 12px; margin-bottom: 16px;">
              Assign source devices to inputs and display devices to outputs. This helps organize your matrix routing.
            </p>

            <div style="margin-bottom: 24px;">
              <h4 style="margin: 0 0 12px 0; font-size: 14px; color: var(--primary-text-color);">Routing Command Template</h4>
              <div style="background: var(--secondary-background-color); padding: 12px; border-radius: 8px;">
                <p style="color: var(--secondary-text-color); font-size: 11px; margin: 0 0 8px 0;">
                  Template for routing commands. Use {input} and {output} as placeholders.<br>
                  Example for OREI: <code>s in {input} av out {output}!</code>
                </p>
                <input type="text" id="routing-template"
                       value="${matrixDevice.routing_template || ''}"
                       placeholder="s in {input} av out {output}!"
                       style="width: 100%; padding: 8px 12px; border: 1px solid var(--divider-color); border-radius: 4px; font-family: monospace;" />
                <label style="display: block; margin: 12px 0 4px 0; font-size: 12px; color: var(--secondary-text-color);">Query Command Template</label>
                <p style="margin: 0 0 8px 0; font-size: 11px; color: var(--secondary-text-color);">
                  Template to query current input. Use {output} as placeholder.<br>
                  Example for OREI: <code>r av out {output}!</code>
                </p>
                <input type="text" id="query-template"
                       value="${matrixDevice.query_template || ''}"
                       placeholder="r av out {output}!"
                       style="width: 100%; padding: 8px 12px; border: 1px solid var(--divider-color); border-radius: 4px; font-family: monospace;" />
              </div>
            </div>

            <div style="margin-bottom: 24px;">
              <h4 style="margin: 0 0 12px 0; font-size: 14px; color: var(--primary-text-color);">Inputs (Sources)</h4>
              <div style="background: var(--secondary-background-color); padding: 12px; border-radius: 8px;">
                ${matrixInputs.length === 0 ? `
                  <p style="color: var(--secondary-text-color); font-size: 12px;">No inputs configured for this matrix.</p>
                ` : matrixInputs.map((input, idx) => `
                  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px; ${input.enabled === false ? 'opacity: 0.5;' : ''}">
                    <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;" title="Enable/disable this input">
                      <input type="checkbox" class="matrix-input-enabled" data-index="${input.index}"
                             ${input.enabled !== false ? 'checked' : ''} />
                    </label>
                    <span style="min-width: 60px; font-size: 13px;">Input ${input.index}:</span>
                    <input type="text" class="matrix-input-name-edit" data-index="${input.index}"
                           value="${input.name || ''}" placeholder="Input ${input.index} name"
                           style="flex: 1; padding: 6px 10px; border: 1px solid var(--divider-color); border-radius: 4px;" />
                    <select class="matrix-input-device" data-index="${input.index}"
                            style="flex: 1; padding: 6px 10px; border: 1px solid var(--divider-color); border-radius: 4px;">
                      <option value="">-- Unassigned --</option>
                      ${availableDevices.map(d => `
                        <option value="${d.device_id}" ${input.device_id === d.device_id ? 'selected' : ''}>${d.name}${d._type === 'ha' ? ' (HA)' : d._type === 'serial' ? ' (Serial)' : ''}</option>
                      `).join('')}
                    </select>
                  </div>
                `).join('')}
              </div>
            </div>

            <div>
              <h4 style="margin: 0 0 12px 0; font-size: 14px; color: var(--primary-text-color);">Outputs (Displays)</h4>
              <div style="background: var(--secondary-background-color); padding: 12px; border-radius: 8px;">
                ${matrixOutputs.length === 0 ? `
                  <p style="color: var(--secondary-text-color); font-size: 12px;">No outputs configured for this matrix.</p>
                ` : matrixOutputs.map((output, idx) => `
                  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                    <span style="min-width: 80px; font-size: 13px;">Output ${output.index}:</span>
                    <input type="text" class="matrix-output-name-edit" data-index="${output.index}"
                           value="${output.name || ''}" placeholder="Output ${output.index} name"
                           style="flex: 1; padding: 6px 10px; border: 1px solid var(--divider-color); border-radius: 4px;" />
                    <select class="matrix-output-device" data-index="${output.index}"
                            style="flex: 1; padding: 6px 10px; border: 1px solid var(--divider-color); border-radius: 4px;">
                      <option value="">-- Unassigned --</option>
                      ${availableDevices.map(d => `
                        <option value="${d.device_id}" ${output.device_id === d.device_id ? 'selected' : ''}>${d.name}${d._type === 'ha' ? ' (HA)' : d._type === 'serial' ? ' (Serial)' : ''}</option>
                      `).join('')}
                    </select>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" data-action="save-matrix-io">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  async _openEditMatrixModal(deviceId, deviceType) {
    // Load full device details with matrix_inputs and matrix_outputs
    try {
      const endpoint = deviceType === 'network'
        ? `/api/vda_ir_control/network_devices/${deviceId}`
        : `/api/vda_ir_control/serial_devices/${deviceId}`;

      // Load matrix device and controlled devices in parallel
      const [matrixResp, devicesResp] = await Promise.all([
        fetch(endpoint, {
          headers: { 'Authorization': `Bearer ${this._hass.auth.data.access_token}` }
        }),
        fetch('/api/vda_ir_control/devices', {
          headers: { 'Authorization': `Bearer ${this._hass.auth.data.access_token}` }
        })
      ]);

      if (matrixResp.ok) {
        const matrixDevice = await matrixResp.json();

        // Get controlled devices that are linked to this matrix
        let linkedDevices = [];
        if (devicesResp.ok) {
          const devicesData = await devicesResp.json();
          linkedDevices = (devicesData.devices || []).filter(d =>
            d.matrix_device_id === deviceId
          );
        }

        // Auto-populate with defaults if empty (8 inputs/outputs for typical matrix)
        if (!matrixDevice.matrix_inputs || matrixDevice.matrix_inputs.length === 0) {
          matrixDevice.matrix_inputs = Array.from({length: 8}, (_, i) => ({
            index: i + 1,
            name: `Input ${i + 1}`,
            device_id: null
          }));
        }
        if (!matrixDevice.matrix_outputs || matrixDevice.matrix_outputs.length === 0) {
          matrixDevice.matrix_outputs = Array.from({length: 8}, (_, i) => ({
            index: i + 1,
            name: `Output ${i + 1}`,
            device_id: null
          }));
        }

        // Merge linked devices into matrix inputs
        if (matrixDevice.matrix_inputs) {
          matrixDevice.matrix_inputs = matrixDevice.matrix_inputs.map(input => {
            const linkedDevice = linkedDevices.find(d =>
              d.matrix_port_type === 'input' && String(d.matrix_port) === String(input.index)
            );
            if (linkedDevice) {
              return { ...input, device_id: linkedDevice.device_id };
            }
            return input;
          });
        }

        // Merge linked devices into matrix outputs
        if (matrixDevice.matrix_outputs) {
          matrixDevice.matrix_outputs = matrixDevice.matrix_outputs.map(output => {
            const linkedDevice = linkedDevices.find(d =>
              d.matrix_port_type === 'output' && String(d.matrix_port) === String(output.index)
            );
            if (linkedDevice) {
              return { ...output, device_id: linkedDevice.device_id };
            }
            return output;
          });
        }

        this._modal = {
          type: 'edit-matrix-io',
          matrixDevice: matrixDevice,
          deviceType: deviceType,
          linkedDevices: linkedDevices  // Store for reference
        };
        this._render();
      } else {
        console.error('Failed to load matrix device');
      }
    } catch (e) {
      console.error('Failed to load matrix device:', e);
    }
  }

  async _saveMatrixIO() {
    const matrixDevice = this._modal?.matrixDevice;
    const deviceType = this._modal?.deviceType;
    if (!matrixDevice) return;

    // Gather updated inputs
    const matrixInputs = [];
    this.shadowRoot.querySelectorAll('.matrix-input-device').forEach(select => {
      const index = parseInt(select.dataset.index);
      const nameInput = this.shadowRoot.querySelector(`.matrix-input-name-edit[data-index="${index}"]`);
      const enabledCheckbox = this.shadowRoot.querySelector(`.matrix-input-enabled[data-index="${index}"]`);
      matrixInputs.push({
        index: index,
        name: nameInput?.value || '',
        device_id: select.value || null,
        enabled: enabledCheckbox?.checked !== false
      });
    });

    // Gather updated outputs
    const matrixOutputs = [];
    this.shadowRoot.querySelectorAll('.matrix-output-device').forEach(select => {
      const index = parseInt(select.dataset.index);
      const nameInput = this.shadowRoot.querySelector(`.matrix-output-name-edit[data-index="${index}"]`);
      matrixOutputs.push({
        index: index,
        name: nameInput?.value || '',
        device_id: select.value || null
      });
    });

    // Get routing template
    const routingTemplateInput = this.shadowRoot.getElementById('routing-template');
    const routingTemplate = routingTemplateInput?.value || '';

    // Get query template
    const queryTemplateInput = this.shadowRoot.getElementById('query-template');
    const queryTemplate = queryTemplateInput?.value || '';

    try {
      const endpoint = deviceType === 'network'
        ? `/api/vda_ir_control/network_devices/${matrixDevice.device_id}`
        : `/api/vda_ir_control/serial_devices/${matrixDevice.device_id}`;

      const resp = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          matrix_inputs: matrixInputs,
          matrix_outputs: matrixOutputs,
          routing_template: routingTemplate,
          query_template: queryTemplate
        })
      });

      if (resp.ok) {
        // Sync controlled devices with matrix I/O assignments
        const linkedDevices = this._modal?.linkedDevices || [];
        console.log('Saving matrix I/O - linkedDevices:', linkedDevices);
        console.log('Saving matrix I/O - matrixInputs:', matrixInputs);
        console.log('Saving matrix I/O - matrixOutputs:', matrixOutputs);

        // Update devices assigned to inputs
        for (const input of matrixInputs) {
          if (input.device_id) {
            // Update the device to link to this matrix input
            await this._updateDeviceMatrixLink(input.device_id, matrixDevice.device_id, deviceType, 'input', String(input.index));
          }
        }

        // Update devices assigned to outputs
        for (const output of matrixOutputs) {
          if (output.device_id) {
            // Update the device to link to this matrix output
            await this._updateDeviceMatrixLink(output.device_id, matrixDevice.device_id, deviceType, 'output', String(output.index));
          }
        }

        // Clear matrix link for devices that were unassigned
        for (const linkedDevice of linkedDevices) {
          const stillAssignedInput = matrixInputs.find(i => i.device_id === linkedDevice.device_id);
          const stillAssignedOutput = matrixOutputs.find(o => o.device_id === linkedDevice.device_id);
          if (!stillAssignedInput && !stillAssignedOutput) {
            // Device was unassigned, clear its matrix link
            await this._updateDeviceMatrixLink(linkedDevice.device_id, null, null, null, null);
          }
        }

        this._modal = null;
        // Reload devices to reflect changes
        if (deviceType === 'network') {
          await this._loadNetworkDevices();
        } else {
          await this._loadSerialDevices();
        }
        await this._loadDevices();
        this._render();
      } else {
        const err = await resp.json();
        alert('Failed to save: ' + (err.error || 'Unknown error'));
      }
    } catch (e) {
      console.error('Failed to save matrix I/O:', e);
      alert('Failed to save matrix I/O configuration');
    }
  }

  async _updateDeviceMatrixLink(deviceId, matrixDeviceId, matrixDeviceType, portType, port) {
    console.log(`Updating device ${deviceId} matrix link:`, { matrixDeviceId, matrixDeviceType, portType, port });
    try {
      // Check if this is an HA device
      const isHADevice = this._haDevices.some(d => d.device_id === deviceId);
      // Check if this is a serial device (exclude the matrix itself)
      const isSerialDevice = this._serialDevices.some(d => d.device_id === deviceId && d.device_type !== 'hdmi_matrix');

      if (isHADevice) {
        // Update HA device via API
        const resp = await fetch(`/api/vda_ir_control/ha_devices/${deviceId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            matrix_device_id: matrixDeviceId || '',
            matrix_device_type: matrixDeviceType || '',
            matrix_port: port || ''
          })
        });
        if (!resp.ok) {
          console.error(`Failed to update HA device ${deviceId}`);
        } else {
          console.log(`Successfully updated HA device ${deviceId}`);
        }
      } else if (isSerialDevice) {
        // Serial devices don't need to store matrix link info on themselves
        // The matrix stores which device is on which output
        // So we just log and skip updating the serial device itself
        console.log(`Serial device ${deviceId} assigned to matrix output - no device update needed`);
      } else {
        // Update IR device via service
        await this._hass.callService('vda_ir_control', 'update_device', {
          device_id: deviceId,
          matrix_device_id: matrixDeviceId,
          matrix_device_type: matrixDeviceType,
          matrix_port_type: portType,
          matrix_port: port
        });
        console.log(`Successfully updated IR device ${deviceId}`);
      }
    } catch (e) {
      console.error(`Failed to update device ${deviceId} matrix link:`, e);
    }
  }

  _renderEditDeviceModal() {
    const device = this._modal?.editDevice;
    if (!device) return '';

    const boards = this._getBoards();
    const matrixDevices = [
      ...this._serialDevices.map(d => ({ ...d, type: 'serial' })),
    ];

    const hasMatrixLink = device.matrix_device_id ? true : false;

    return `
      <div class="modal" data-action="close-modal">
        <div class="modal-content" onclick="event.stopPropagation()">
          <div class="modal-title">Edit Device: ${device.name}</div>

          <div class="form-group">
            <label>Device ID</label>
            <input type="text" id="edit-device-id" value="${device.device_id}" disabled style="background: var(--secondary-background-color);">
            <small>Device ID cannot be changed</small>
          </div>

          <div class="form-group">
            <label>Device Name</label>
            <input type="text" id="edit-device-name" value="${device.name}" placeholder="e.g., Bar TV 1">
          </div>

          <div class="form-group">
            <label>Location</label>
            <input type="text" id="edit-device-location" value="${device.location || ''}" placeholder="e.g., Bar Area">
          </div>

          <div class="form-group">
            <label>Profile</label>
            <select id="edit-device-profile">
              ${this._builtinProfiles.length > 0 ? `
                <optgroup label="Downloaded Profiles">
                  ${this._builtinProfiles.map(p => `
                    <option value="builtin:${p.profile_id}" ${device.device_profile_id === `builtin:${p.profile_id}` ? 'selected' : ''}>${p.name} (${p.manufacturer})</option>
                  `).join('')}
                </optgroup>
              ` : ''}
              ${this._profiles.length > 0 ? `
                <optgroup label="My Custom Profiles">
                  ${this._profiles.map(p => `
                    <option value="${p.profile_id}" ${device.device_profile_id === p.profile_id ? 'selected' : ''}>${p.name}</option>
                  `).join('')}
                </optgroup>
              ` : ''}
            </select>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Board</label>
              <select id="edit-device-board" data-action="edit-device-board-changed">
                ${boards.map(b => `
                  <option value="${b.board_id}" ${device.board_id === b.board_id ? 'selected' : ''}>${b.board_name}</option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Output Port</label>
              ${this._deviceOutputPorts.length > 0 ? `
                <select id="edit-device-port">
                  ${this._deviceOutputPorts.map(p => `
                    <option value="${p.port}" ${device.output_port === p.port ? 'selected' : ''}>${p.gpio_name || 'GPIO' + p.gpio} - ${p.name || 'Unnamed'}</option>
                  `).join('')}
                </select>
              ` : `
                <select id="edit-device-port" disabled>
                  <option value="${device.output_port}">Port ${device.output_port}</option>
                </select>
              `}
            </div>
          </div>

          <!-- Matrix Link Section -->
          <div style="margin-top: 16px; padding: 12px; background: var(--secondary-background-color, #f5f5f5); border-radius: 8px;">
            <div class="form-group" style="margin-bottom: 8px;">
              <label><input type="checkbox" id="edit-device-link-matrix" ${hasMatrixLink ? 'checked' : ''} style="margin-right: 8px; vertical-align: middle;" />Link to HDMI Matrix</label>
              <small>Connect this device to an HDMI matrix</small>
            </div>
            <div id="edit-matrix-link-options" style="display: ${hasMatrixLink ? 'block' : 'none'};">
              <div class="form-group">
                <label>Matrix Device</label>
                <select id="edit-device-matrix-id" data-action="edit-matrix-device-changed">
                  <option value="">Select a matrix...</option>
                  ${matrixDevices.map(d => `
                    <option value="${d.device_id}" data-type="${d.type}" ${device.matrix_device_id === d.device_id ? 'selected' : ''}>${d.name} (${d.type === 'network' ? 'Network' : 'Serial'})</option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Device Type</label>
                <select id="edit-device-matrix-type" data-action="edit-matrix-type-changed">
                  <option value="input" ${device.matrix_port_type !== 'output' ? 'selected' : ''}>Input Device (Source: Cable Box, Streaming, etc.)</option>
                  <option value="output" ${device.matrix_port_type === 'output' ? 'selected' : ''}>Output Device (Display: TV, Projector, etc.)</option>
                </select>
              </div>
              <div class="form-group">
                <label id="edit-matrix-port-label">${device.matrix_port_type === 'output' ? 'Matrix Output' : 'Matrix Input'}</label>
                <select id="edit-device-matrix-port">
                  ${this._modal?.matrixPortOptions ? this._modal.matrixPortOptions.map(o => `
                    <option value="${o.value}" ${device.matrix_port === o.value ? 'selected' : ''}>${o.label}</option>
                  `).join('') : `<option value="${device.matrix_port || ''}">${device.matrix_port_type === 'output' ? 'Output' : 'Input'} ${device.matrix_port || '?'}</option>`}
                </select>
                <small id="edit-matrix-port-help">${device.matrix_port_type === 'output' ? 'Which matrix output is this display connected to?' : 'Which matrix input is this source device connected to?'}</small>
              </div>
            </div>
          </div>

          <!-- Screen Link Section (for projectors) -->
          <div style="margin-top: 16px; padding: 12px; background: var(--secondary-background-color, #f5f5f5); border-radius: 8px;">
            <div class="form-group" style="margin-bottom: 8px;">
              <label><input type="checkbox" id="edit-device-link-screen" ${device.linked_screen_id ? 'checked' : ''} style="margin-right: 8px; vertical-align: middle;" />Link to Projector Screen</label>
              <small>Automatically control a motorized projector screen when powering this device</small>
            </div>
            <div id="edit-screen-link-options" style="display: ${device.linked_screen_id ? 'block' : 'none'};">
              <div class="form-group">
                <label>Screen Device</label>
                <select id="edit-device-screen-id">
                  <option value="">Select a screen...</option>
                  ${this._devices.filter(d => {
                    if (!d.device_profile_id) return false;
                    const pid = d.device_profile_id.toLowerCase();
                    return pid.includes('screen') || pid.includes('elite');
                  }).map(d => `
                    <option value="${d.device_id}" ${device.linked_screen_id === d.device_id ? 'selected' : ''}>${d.name}</option>
                  `).join('')}
                </select>
                <small>Select a projector screen device to control</small>
              </div>
              <div class="form-group">
                <label>Screen Down Delay (seconds)</label>
                <input type="number" id="edit-device-screen-delay" value="${device.screen_down_delay || ''}" step="0.01" min="0" max="60" placeholder="e.g., 3.75">
                <small>Time to wait after down before sending stop (for partial lower)</small>
              </div>
              ${device.linked_screen_id ? `
                <div class="form-group">
                  <label>Test Screen Controls</label>
                  <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="btn btn-secondary" data-action="test-screen-cmd" data-screen-id="${device.linked_screen_id}" data-cmd="up" style="flex: 1; min-width: 60px;">Up</button>
                    <button class="btn btn-secondary" data-action="test-screen-cmd" data-screen-id="${device.linked_screen_id}" data-cmd="down" style="flex: 1; min-width: 60px;">Down</button>
                    <button class="btn btn-secondary" data-action="test-screen-cmd" data-screen-id="${device.linked_screen_id}" data-cmd="stop" style="flex: 1; min-width: 60px;">Stop</button>
                  </div>
                  <div style="margin-top: 8px;">
                    <button class="btn btn-primary" data-action="test-timed-down" data-screen-id="${device.linked_screen_id}" style="width: 100%;">Test Timed Down (${device.screen_down_delay || 0}s)</button>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" data-action="update-device">Save Changes</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderGroupModal() {
    const isEdit = this._modal.type === 'edit-group';
    const group = this._modal.group || {};

    // Get all available devices (IR devices + serial devices)
    const allDevices = [
      ...this._devices.map(d => ({ id: d.device_id, name: d.name, type: 'controlled', location: d.location })),
      ...this._serialDevices.map(d => ({ id: d.device_id, name: d.name, type: 'serial', location: d.location })),
    ];

    const members = group.members || [];
    const memberIds = members.map(m => m.device_id);

    return `
      <div class="modal" data-action="close-modal">
        <div class="modal-content" onclick="event.stopPropagation()">
          <div class="modal-title">${isEdit ? 'Edit Device Group' : 'Create Device Group'}</div>

          <div class="form-group">
            <label>Group Name</label>
            <input type="text" id="group-name" value="${group.name || ''}" placeholder="e.g., All Bar TVs">
          </div>

          <div class="form-group">
            <label>Location (Optional)</label>
            <input type="text" id="group-location" value="${group.location || ''}" placeholder="e.g., Bar Area">
          </div>

          <div class="form-group">
            <label>Sequence Delay (ms)</label>
            <input type="number" id="group-delay" value="${group.sequence_delay_ms || 20}" min="0" max="5000" placeholder="20">
            <small>Delay between power commands to each device</small>
          </div>

          <div class="form-group">
            <label>Devices in Group</label>
            <div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--divider-color, #e0e0e0); border-radius: 8px; padding: 8px;">
              ${allDevices.length === 0 ? `
                <p style="color: var(--secondary-text-color); font-size: 12px; margin: 0;">No devices available</p>
              ` : allDevices.map(device => `
                <div style="padding: 8px 4px; border-bottom: 1px solid var(--divider-color, #eee);">
                  <label style="display: block; cursor: pointer;">
                    <input type="checkbox" class="group-device-checkbox"
                           data-device-id="${device.id}"
                           data-device-type="${device.type}"
                           ${memberIds.includes(device.id) ? 'checked' : ''}
                           style="margin-right: 8px; vertical-align: middle;">
                    <span style="vertical-align: middle; color: var(--primary-text-color);">${device.name}</span>
                    <span class="badge badge-info" style="font-size: 10px; margin-left: 8px; vertical-align: middle;">${device.type === 'controlled' ? 'IR' : 'Serial'}</span>
                    ${device.location ? `<span class="badge badge-warning" style="font-size: 10px; margin-left: 4px; vertical-align: middle;">${device.location}</span>` : ''}
                  </label>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" data-action="save-group">${isEdit ? 'Save Changes' : 'Create Group'}</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderHADeviceModal() {
    const isEdit = this._modal.type === 'edit-ha-device';
    const device = this._modal.device || {};

    const familyOptions = [
      { value: 'apple_tv', label: 'Apple TV' },
      { value: 'roku', label: 'Roku' },
      { value: 'android_tv', label: 'Android TV' },
      { value: 'fire_tv', label: 'Fire TV' },
      { value: 'chromecast', label: 'Chromecast' },
      { value: 'nvidia_shield', label: 'NVIDIA Shield' },
      { value: 'directv', label: 'DirecTV' },
      { value: 'custom', label: 'Custom' },
    ];

    // Get all matrix devices for linking
    const matrixDevices = [
      ...this._serialDevices.filter(d => d.device_type === 'hdmi_matrix').map(d => ({
        id: d.device_id,
        name: d.name,
        type: 'serial',
        inputs: d.matrix_inputs || [],
        outputs: d.matrix_outputs || [],
      })),
    ];

    const hasMatrix = device.matrix_device_id ? true : false;

    return `
      <div class="modal" data-action="close-modal">
        <div class="modal-content" onclick="event.stopPropagation()">
          <div class="modal-title">${isEdit ? 'Edit HA Device' : 'Add HA Device'}</div>

          ${!isEdit ? `
            <div class="form-group">
              <label>Device ID</label>
              <input type="text" id="ha-device-id" placeholder="e.g., living_room_apple_tv">
            </div>
          ` : ''}

          <div class="form-group">
            <label>Device Name</label>
            <input type="text" id="ha-device-name" value="${device.name || ''}" placeholder="e.g., Living Room Apple TV">
          </div>

          <div class="form-group">
            <label>Device Family</label>
            <select id="ha-device-family">
              ${familyOptions.map(opt => `
                <option value="${opt.value}" ${device.device_family === opt.value ? 'selected' : ''}>${opt.label}</option>
              `).join('')}
            </select>
          </div>

          <div class="form-group">
            <label>Entity</label>
            <select id="ha-entity-id">
              <option value="">Select entity...</option>
              ${this._haEntities.length > 0 ? `
                ${this._haEntities.filter(e => e.domain === 'remote').length > 0 ? `
                  <optgroup label="Remote">
                    ${this._haEntities.filter(e => e.domain === 'remote').map(e => `
                      <option value="${e.entity_id}" ${device.entity_id === e.entity_id ? 'selected' : ''}>${e.name} (${e.entity_id})</option>
                    `).join('')}
                  </optgroup>
                ` : ''}
                ${this._haEntities.filter(e => e.domain === 'media_player').length > 0 ? `
                  <optgroup label="Media Player">
                    ${this._haEntities.filter(e => e.domain === 'media_player').map(e => `
                      <option value="${e.entity_id}" ${device.entity_id === e.entity_id ? 'selected' : ''}>${e.name} (${e.entity_id})</option>
                    `).join('')}
                  </optgroup>
                ` : ''}
              ` : '<option value="" disabled>No entities found</option>'}
            </select>
          </div>

          <div class="form-group">
            <label>Location</label>
            <input type="text" id="ha-device-location" value="${device.location || ''}" placeholder="e.g., Living Room">
          </div>

          <div class="form-group">
            <label>Media Player Entity (for Now Playing info)</label>
            <select id="ha-media-player-entity">
              <option value="">None (auto-detect)</option>
              ${this._haEntities.filter(e => e.domain === 'media_player').map(e => `
                <option value="${e.entity_id}" ${device.media_player_entity_id === e.entity_id ? 'selected' : ''}>${e.name} (${e.entity_id})</option>
              `).join('')}
            </select>
            <small style="color: var(--secondary-text-color); font-size: 11px;">Optional: Select a media_player for channel/show info display</small>
          </div>

          ${matrixDevices.length > 0 ? `
            <div class="form-group" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--divider-color, #e0e0e0);">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="ha-link-to-matrix" ${hasMatrix ? 'checked' : ''} data-action="toggle-ha-matrix-link">
                Link to Matrix as Input Source
              </label>
            </div>

            <div id="ha-matrix-link-options" style="display: ${hasMatrix ? 'block' : 'none'};">
              <div class="form-group">
                <label>Matrix Device</label>
                <select id="ha-matrix-device-id" data-action="ha-matrix-device-changed">
                  <option value="">Select Matrix...</option>
                  ${matrixDevices.map(m => `
                    <option value="${m.id}" data-type="${m.type}" ${device.matrix_device_id === m.id ? 'selected' : ''}>${m.name}</option>
                  `).join('')}
                </select>
              </div>

              <div class="form-group">
                <label>Input Port</label>
                <select id="ha-matrix-port">
                  <option value="">Select Input...</option>
                  ${device.matrix_device_id && matrixDevices.find(m => m.id === device.matrix_device_id) ?
                    matrixDevices.find(m => m.id === device.matrix_device_id).inputs.map(i => `
                      <option value="${i.index}" ${String(device.matrix_port) === String(i.index) ? 'selected' : ''}>${i.name || 'Input ' + i.index}</option>
                    `).join('') : ''}
                </select>
              </div>
            </div>
          ` : ''}

          <div class="modal-actions">
            <button class="btn btn-secondary" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" data-action="save-ha-device">${isEdit ? 'Save Changes' : 'Add Device'}</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderHARemoteControlModal() {
    const device = this._haDevices.find(d => d.device_id === this._modal.deviceId);
    if (!device) return '';

    const familyLabels = {
      'apple_tv': 'Apple TV',
      'roku': 'Roku',
      'android_tv': 'Android TV',
      'fire_tv': 'Fire TV',
      'chromecast': 'Chromecast',
      'nvidia_shield': 'NVIDIA Shield',
      'directv': 'DirecTV',
      'custom': 'Custom',
    };

    const familyCommands = {
      'apple_tv': ['up', 'down', 'left', 'right', 'select', 'menu', 'home', 'play_pause', 'pause', 'stop', 'previous', 'next', 'volume_up', 'volume_down', 'skip_forward', 'skip_backward', 'turn_on', 'turn_off', 'wakeup'],
      'roku': ['up', 'down', 'left', 'right', 'select', 'back', 'home', 'info', 'play', 'pause', 'reverse', 'forward', 'replay', 'search', 'power', 'volume_up', 'volume_down', 'volume_mute', 'channel_up', 'channel_down', 'input_tuner', 'input_hdmi1', 'input_hdmi2', 'input_hdmi3', 'input_hdmi4', 'input_av1'],
      'android_tv': ['up', 'down', 'left', 'right', 'center', 'back', 'home', 'menu', 'play', 'pause', 'stop', 'next', 'previous', 'volume_up', 'volume_down', 'mute', 'power', 'dpad_up', 'dpad_down', 'dpad_left', 'dpad_right', 'dpad_center'],
      'fire_tv': ['up', 'down', 'left', 'right', 'select', 'back', 'home', 'menu', 'play', 'pause', 'stop', 'rewind', 'fastforward', 'next', 'previous', 'volume_up', 'volume_down', 'mute', 'power'],
      'chromecast': ['up', 'down', 'left', 'right', 'select', 'back', 'home', 'volume_up', 'volume_down', 'mute', 'play', 'pause', 'stop', 'next', 'previous', 'rewind', 'forward'],
      'nvidia_shield': ['up', 'down', 'left', 'right', 'select', 'back', 'home', 'menu', 'play', 'pause', 'stop', 'next', 'previous', 'volume_up', 'volume_down', 'mute'],
      'directv': ['up', 'down', 'left', 'right', 'select', 'menu', 'guide', 'info', 'exit', 'back', 'play', 'pause', 'stop', 'record', 'ffwd', 'rew', 'advance', 'replay', 'power', 'poweron', 'poweroff', 'chanup', 'chandown', 'prev', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'dash', 'enter', 'active', 'list', 'format', 'red', 'green', 'yellow', 'blue'],
      'custom': [],
    };

    const commands = familyCommands[device.device_family] || [];

    const powerCmds = commands.filter(c => c.includes('power') || c === 'turn_on' || c === 'turn_off' || c === 'wakeup');
    const volCmds = commands.filter(c => c.includes('volume') || c === 'mute');
    const chanCmds = commands.filter(c => c.includes('chan') || c === 'prev');
    const navCmds = commands.filter(c => ['up', 'down', 'left', 'right', 'center', 'select', 'enter', 'back', 'exit', 'menu', 'home', 'guide', 'info', 'dpad_up', 'dpad_down', 'dpad_left', 'dpad_right', 'dpad_center'].includes(c));
    const numCmds = commands.filter(c => /^[0-9]$/.test(c));
    const playCmds = commands.filter(c => ['play', 'pause', 'play_pause', 'stop', 'rewind', 'rew', 'fast_forward', 'fastforward', 'ffwd', 'forward', 'record', 'replay', 'skip_forward', 'skip_backward', 'previous', 'next', 'advance'].includes(c));
    const colorCmds = commands.filter(c => ['red', 'green', 'yellow', 'blue'].includes(c));
    const otherCmds = commands.filter(c =>
      !powerCmds.includes(c) && !volCmds.includes(c) && !chanCmds.includes(c) &&
      !navCmds.includes(c) && !numCmds.includes(c) && !playCmds.includes(c) && !colorCmds.includes(c)
    );

    return `
      <div class="modal" data-action="close-modal">
        <div class="modal-content" onclick="event.stopPropagation()" style="max-width: 450px;">
          <div class="modal-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>Remote: ${device.name}</span>
            <span class="badge badge-info">${familyLabels[device.device_family] || device.device_family}</span>
          </div>

          <div style="font-size: 11px; color: var(--secondary-text-color); margin-bottom: 16px;">Entity: ${device.entity_id}</div>

          ${this._modal.lastSent ? `
            <div style="padding: 8px 12px; background: var(--success-color, #4caf50); color: white; border-radius: 6px; margin-bottom: 16px; text-align: center; font-size: 13px;">
              Sent: ${this._formatCommand(this._modal.lastSent)}
            </div>
          ` : ''}

          <div class="remote-layout" style="display: flex; flex-direction: column; gap: 16px;">

            <!-- Power -->
            ${powerCmds.length > 0 ? `
              <div class="remote-section">
                <div style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;">
                  ${powerCmds.map(cmd => `
                    <button class="remote-btn power" data-action="send-ha-remote-cmd" data-command="${cmd}">
                      ${cmd === 'power' || cmd === 'turn_on' || cmd === 'turn_off' || cmd === 'wakeup' ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"/></svg> ${this._formatCommand(cmd)}` : this._formatCommand(cmd)}
                    </button>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Navigation D-pad -->
            ${navCmds.length > 0 ? `
              <div class="remote-section">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; max-width: 180px; margin: 0 auto;">
                  <div></div>
                  ${navCmds.includes('up') || navCmds.includes('dpad_up') ? `<button class="remote-btn nav" data-action="send-ha-remote-cmd" data-command="${navCmds.includes('up') ? 'up' : 'dpad_up'}"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg></button>` : '<div></div>'}
                  <div></div>
                  ${navCmds.includes('left') || navCmds.includes('dpad_left') ? `<button class="remote-btn nav" data-action="send-ha-remote-cmd" data-command="${navCmds.includes('left') ? 'left' : 'dpad_left'}"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></button>` : '<div></div>'}
                  ${navCmds.includes('select') || navCmds.includes('enter') || navCmds.includes('center') || navCmds.includes('dpad_center') ? `<button class="remote-btn nav ok" data-action="send-ha-remote-cmd" data-command="${navCmds.includes('select') ? 'select' : navCmds.includes('enter') ? 'enter' : navCmds.includes('center') ? 'center' : 'dpad_center'}">OK</button>` : '<div></div>'}
                  ${navCmds.includes('right') || navCmds.includes('dpad_right') ? `<button class="remote-btn nav" data-action="send-ha-remote-cmd" data-command="${navCmds.includes('right') ? 'right' : 'dpad_right'}"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg></button>` : '<div></div>'}
                  <div></div>
                  ${navCmds.includes('down') || navCmds.includes('dpad_down') ? `<button class="remote-btn nav" data-action="send-ha-remote-cmd" data-command="${navCmds.includes('down') ? 'down' : 'dpad_down'}"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg></button>` : '<div></div>'}
                  <div></div>
                </div>
                <div style="display: flex; justify-content: center; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                  ${navCmds.filter(c => !['up','down','left','right','select','enter','center','dpad_up','dpad_down','dpad_left','dpad_right','dpad_center'].includes(c)).map(cmd => `
                    <button class="remote-btn" data-action="send-ha-remote-cmd" data-command="${cmd}">${this._formatCommand(cmd)}</button>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Volume & Channel -->
            ${volCmds.length > 0 || chanCmds.length > 0 ? `
              <div class="remote-section" style="display: flex; justify-content: space-around;">
                ${volCmds.length > 0 ? `
                  <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <span style="font-size: 11px; color: var(--secondary-text-color);">Volume</span>
                    ${volCmds.includes('volume_up') ? `<button class="remote-btn vol" data-action="send-ha-remote-cmd" data-command="volume_up">+</button>` : ''}
                    ${volCmds.includes('mute') || volCmds.includes('volume_mute') ? `<button class="remote-btn vol mute" data-action="send-ha-remote-cmd" data-command="${volCmds.includes('mute') ? 'mute' : 'volume_mute'}"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg></button>` : ''}
                    ${volCmds.includes('volume_down') ? `<button class="remote-btn vol" data-action="send-ha-remote-cmd" data-command="volume_down">−</button>` : ''}
                  </div>
                ` : ''}
                ${chanCmds.length > 0 ? `
                  <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <span style="font-size: 11px; color: var(--secondary-text-color);">Channel</span>
                    ${chanCmds.includes('chanup') || chanCmds.includes('channel_up') ? `<button class="remote-btn chan" data-action="send-ha-remote-cmd" data-command="${chanCmds.includes('chanup') ? 'chanup' : 'channel_up'}"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg></button>` : ''}
                    ${chanCmds.includes('chandown') || chanCmds.includes('channel_down') ? `<button class="remote-btn chan" data-action="send-ha-remote-cmd" data-command="${chanCmds.includes('chandown') ? 'chandown' : 'channel_down'}"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg></button>` : ''}
                    ${chanCmds.includes('prev') ? `<button class="remote-btn chan" data-action="send-ha-remote-cmd" data-command="prev">Prev</button>` : ''}
                  </div>
                ` : ''}
              </div>
            ` : ''}

            <!-- Number Pad -->
            ${numCmds.length > 0 ? `
              <div class="remote-section">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; max-width: 180px; margin: 0 auto;">
                  ${['1','2','3','4','5','6','7','8','9','','0',''].map(n => {
                    if (n === '') return '<div></div>';
                    const cmd = numCmds.find(c => c === n);
                    return cmd ? `<button class="remote-btn num" data-action="send-ha-remote-cmd" data-command="${cmd}">${n}</button>` : '<div></div>';
                  }).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Playback Controls -->
            ${playCmds.length > 0 ? `
              <div class="remote-section">
                <div style="display: flex; justify-content: center; gap: 6px; flex-wrap: wrap;">
                  ${playCmds.includes('rewind') || playCmds.includes('rew') || playCmds.includes('reverse') ? `<button class="remote-btn play" data-action="send-ha-remote-cmd" data-command="${playCmds.includes('rewind') ? 'rewind' : playCmds.includes('rew') ? 'rew' : 'reverse'}"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg></button>` : ''}
                  ${playCmds.includes('previous') || playCmds.includes('skip_backward') ? `<button class="remote-btn play" data-action="send-ha-remote-cmd" data-command="${playCmds.includes('previous') ? 'previous' : 'skip_backward'}"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>` : ''}
                  ${playCmds.includes('replay') ? `<button class="remote-btn play" data-action="send-ha-remote-cmd" data-command="replay"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg></button>` : ''}
                  ${playCmds.includes('play') ? `<button class="remote-btn play" data-action="send-ha-remote-cmd" data-command="play"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>` : ''}
                  ${playCmds.includes('play_pause') ? `<button class="remote-btn play" data-action="send-ha-remote-cmd" data-command="play_pause"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>` : ''}
                  ${playCmds.includes('pause') ? `<button class="remote-btn play" data-action="send-ha-remote-cmd" data-command="pause"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg></button>` : ''}
                  ${playCmds.includes('stop') ? `<button class="remote-btn play" data-action="send-ha-remote-cmd" data-command="stop"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 6h12v12H6z"/></svg></button>` : ''}
                  ${playCmds.includes('next') || playCmds.includes('skip_forward') ? `<button class="remote-btn play" data-action="send-ha-remote-cmd" data-command="${playCmds.includes('next') ? 'next' : 'skip_forward'}"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>` : ''}
                  ${playCmds.includes('advance') ? `<button class="remote-btn play" data-action="send-ha-remote-cmd" data-command="advance"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg></button>` : ''}
                  ${playCmds.includes('fast_forward') || playCmds.includes('fastforward') || playCmds.includes('ffwd') || playCmds.includes('forward') ? `<button class="remote-btn play" data-action="send-ha-remote-cmd" data-command="${playCmds.includes('fast_forward') ? 'fast_forward' : playCmds.includes('fastforward') ? 'fastforward' : playCmds.includes('ffwd') ? 'ffwd' : 'forward'}"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg></button>` : ''}
                  ${playCmds.includes('record') ? `<button class="remote-btn play record" data-action="send-ha-remote-cmd" data-command="record"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg></button>` : ''}
                </div>
              </div>
            ` : ''}

            <!-- Color Buttons -->
            ${colorCmds.length > 0 ? `
              <div class="remote-section">
                <div style="display: flex; justify-content: center; gap: 6px; flex-wrap: wrap;">
                  ${colorCmds.includes('red') ? `<button class="remote-btn" style="background: #d32f2f; color: white;" data-action="send-ha-remote-cmd" data-command="red">Red</button>` : ''}
                  ${colorCmds.includes('green') ? `<button class="remote-btn" style="background: #388e3c; color: white;" data-action="send-ha-remote-cmd" data-command="green">Green</button>` : ''}
                  ${colorCmds.includes('yellow') ? `<button class="remote-btn" style="background: #f9a825; color: black;" data-action="send-ha-remote-cmd" data-command="yellow">Yellow</button>` : ''}
                  ${colorCmds.includes('blue') ? `<button class="remote-btn" style="background: #1976d2; color: white;" data-action="send-ha-remote-cmd" data-command="blue">Blue</button>` : ''}
                </div>
              </div>
            ` : ''}

            <!-- Other Commands -->
            ${otherCmds.length > 0 ? `
              <div class="remote-section">
                <div style="font-size: 11px; color: var(--secondary-text-color); margin-bottom: 8px; text-align: center;">Other</div>
                <div style="display: flex; justify-content: center; gap: 6px; flex-wrap: wrap;">
                  ${otherCmds.map(cmd => `
                    <button class="remote-btn" data-action="send-ha-remote-cmd" data-command="${cmd}">${this._formatCommand(cmd)}</button>
                  `).join('')}
                </div>
              </div>
            ` : ''}

          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" data-action="close-modal">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  async _openEditDeviceModal(deviceId) {
    const device = this._devices.find(d => d.device_id === deviceId);
    if (!device) {
      console.error('Device not found:', deviceId);
      return;
    }

    // Load output ports for the device's board
    this._deviceOutputPorts = [];
    if (device.board_id) {
      await this._loadDeviceOutputPorts(device.board_id);
    }

    // Load matrix output options if linked to a matrix
    let matrixOutputOptions = null;
    if (device.matrix_device_id) {
      try {
        const endpoint = device.matrix_device_type === 'network'
          ? `/api/vda_ir_control/network_devices/${device.matrix_device_id}`
          : `/api/vda_ir_control/serial_devices/${device.matrix_device_id}`;

        const resp = await fetch(endpoint, {
          headers: { 'Authorization': `Bearer ${this._hass.auth.data.access_token}` }
        });

        if (resp.ok) {
          const matrixDevice = await resp.json();
          const isInput = device.matrix_port_type === 'input';
          const ports = isInput ? (matrixDevice.matrix_inputs || []) : (matrixDevice.matrix_outputs || []);
          const portType = isInput ? 'Input' : 'Output';

          if (ports.length > 0) {
            matrixOutputOptions = ports.map(o => ({
              value: String(o.index),
              label: o.name || `${portType} ${o.index}`
            }));
          } else {
            // Default to 8 ports if none configured
            matrixOutputOptions = Array.from({length: 8}, (_, i) => ({
              value: String(i + 1),
              label: `${portType} ${i + 1}`
            }));
          }
        }
      } catch (e) {
        console.error('Failed to load matrix outputs:', e);
      }
    }

    this._modal = {
      type: 'edit-device',
      editDevice: device,
      matrixOutputOptions: matrixOutputOptions
    };
    this._render();

    // Add event listener for matrix link checkbox after render
    setTimeout(() => {
      const checkbox = this.shadowRoot.getElementById('edit-device-link-matrix');
      const optionsDiv = this.shadowRoot.getElementById('edit-matrix-link-options');
      if (checkbox && optionsDiv) {
        checkbox.addEventListener('change', (e) => {
          optionsDiv.style.display = e.target.checked ? 'block' : 'none';
        });
      }

      // Add listener for matrix device change to update outputs
      const matrixSelect = this.shadowRoot.getElementById('edit-device-matrix-id');
      if (matrixSelect) {
        matrixSelect.addEventListener('change', async (e) => {
          await this._updateEditMatrixPortOptions(e.target.value, e.target.options[e.target.selectedIndex]?.dataset.type);
        });
      }

      // Add event listener for screen link checkbox
      const screenCheckbox = this.shadowRoot.getElementById('edit-device-link-screen');
      const screenOptionsDiv = this.shadowRoot.getElementById('edit-screen-link-options');
      if (screenCheckbox && screenOptionsDiv) {
        screenCheckbox.addEventListener('change', (e) => {
          screenOptionsDiv.style.display = e.target.checked ? 'block' : 'none';
        });
      }
    }, 0);
  }

  async _updateEditMatrixPortOptions(matrixDeviceId, matrixType) {
    const portSelect = this.shadowRoot.getElementById('edit-device-matrix-port');
    const typeSelect = this.shadowRoot.getElementById('edit-device-matrix-type');
    const portLabel = this.shadowRoot.getElementById('edit-matrix-port-label');
    const portHelp = this.shadowRoot.getElementById('edit-matrix-port-help');

    if (!portSelect) return;

    const isInput = typeSelect?.value === 'input';

    // Update labels based on device type
    if (portLabel) {
      portLabel.textContent = isInput ? 'Matrix Input' : 'Matrix Output';
    }
    if (portHelp) {
      portHelp.textContent = isInput
        ? 'Which matrix input is this source device connected to?'
        : 'Which matrix output is this display connected to?';
    }

    if (!matrixDeviceId) {
      portSelect.innerHTML = '<option value="">Select matrix first...</option>';
      return;
    }

    try {
      const endpoint = matrixType === 'network'
        ? `/api/vda_ir_control/network_devices/${matrixDeviceId}`
        : `/api/vda_ir_control/serial_devices/${matrixDeviceId}`;

      const resp = await fetch(endpoint, {
        headers: { 'Authorization': `Bearer ${this._hass.auth.data.access_token}` }
      });

      if (resp.ok) {
        const device = await resp.json();
        const ports = isInput ? (device.matrix_inputs || []) : (device.matrix_outputs || []);
        const portType = isInput ? 'Input' : 'Output';

        if (ports.length > 0) {
          portSelect.innerHTML = ports.map(p => `
            <option value="${p.index}">${p.name || portType + ' ' + p.index}</option>
          `).join('');
        } else {
          // Default to 8 ports
          portSelect.innerHTML = Array.from({length: 8}, (_, i) => `
            <option value="${i+1}">${portType} ${i+1}</option>
          `).join('');
        }
      }
    } catch (e) {
      console.error('Failed to fetch matrix ports:', e);
    }
  }

  async _updateDevice() {
    const device = this._modal?.editDevice;
    if (!device) return;

    const name = this.shadowRoot.getElementById('edit-device-name')?.value?.trim();
    const location = this.shadowRoot.getElementById('edit-device-location')?.value?.trim();
    const profileId = this.shadowRoot.getElementById('edit-device-profile')?.value;
    const boardId = this.shadowRoot.getElementById('edit-device-board')?.value;
    const port = parseInt(this.shadowRoot.getElementById('edit-device-port')?.value) || 0;

    // Matrix link fields
    const linkMatrix = this.shadowRoot.getElementById('edit-device-link-matrix')?.checked;
    const matrixIdSelect = this.shadowRoot.getElementById('edit-device-matrix-id');
    const matrixTypeSelect = this.shadowRoot.getElementById('edit-device-matrix-type');
    const matrixPortSelect = this.shadowRoot.getElementById('edit-device-matrix-port');

    if (!name) {
      alert('Device name is required');
      return;
    }

    const serviceData = {
      device_id: device.device_id,
      name: name,
      location: location || '',
      device_profile_id: profileId,
      board_id: boardId,
      output_port: port,
    };

    // Add matrix link data if enabled
    if (linkMatrix && matrixIdSelect && matrixIdSelect.value) {
      const selectedOption = matrixIdSelect.options[matrixIdSelect.selectedIndex];
      const isInputDevice = matrixTypeSelect?.value === 'input';
      serviceData.matrix_device_id = matrixIdSelect.value;
      serviceData.matrix_device_type = selectedOption.dataset.type;
      serviceData.matrix_port_type = isInputDevice ? 'input' : 'output';
      serviceData.matrix_port = matrixPortSelect ? matrixPortSelect.value : null;
    } else {
      // Clear matrix link
      serviceData.matrix_device_id = null;
      serviceData.matrix_device_type = null;
      serviceData.matrix_port_type = null;
      serviceData.matrix_port = null;
    }

    // Screen link fields
    const linkScreen = this.shadowRoot.getElementById('edit-device-link-screen')?.checked;
    const screenIdSelect = this.shadowRoot.getElementById('edit-device-screen-id');
    const screenDelayInput = this.shadowRoot.getElementById('edit-device-screen-delay');

    if (linkScreen && screenIdSelect && screenIdSelect.value) {
      serviceData.linked_screen_id = screenIdSelect.value;
      serviceData.screen_down_delay = screenDelayInput?.value ? parseFloat(screenDelayInput.value) : null;
    } else {
      // Clear screen link
      serviceData.linked_screen_id = null;
      serviceData.screen_down_delay = null;
    }

    try {
      await this._hass.callService('vda_ir_control', 'update_device', serviceData);
      this._modal = null;
      await this._loadDevices();
      this._render();
    } catch (e) {
      console.error('Failed to update device:', e);
      alert('Failed to update device: ' + e.message);
    }
  }

  _attachEventListeners() {
    // Tab clicks
    this.shadowRoot.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this._activeTab = e.target.dataset.tab;
        this._selectedBoard = null;
        this._selectedProfile = null;
        this._render();
      });
    });

    // All other actions (click)
    this.shadowRoot.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', (e) => this._handleAction(e));
    });

    // Select change events
    this.shadowRoot.querySelectorAll('select[data-action]').forEach(el => {
      el.addEventListener('change', (e) => this._handleAction(e));
    });
  }

  async _handleAction(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    switch (action) {
      case 'select-board':
        this._selectedBoard = e.target.closest('[data-board-id]').dataset.boardId;
        await this._loadPorts(this._selectedBoard);
        break;

      case 'configure-ports':
        this._selectedBoard = e.target.closest('[data-board-id]').dataset.boardId;
        await this._loadPorts(this._selectedBoard);
        break;

      case 'change-board-type':
        await this._changeBoardType(e.target.closest('[data-board-id]').dataset.boardId, e.target.value);
        break;

      case 'edit-port':
        this._modal = { type: 'edit-port', port: parseInt(e.target.closest('[data-port]').dataset.port) };
        this._render();
        break;

      case 'save-port':
        await this._savePort(parseInt(e.target.dataset.port));
        break;

      case 'create-profile':
        this._modal = { type: 'create-profile' };
        this._render();
        break;

      case 'save-profile':
        await this._saveProfile();
        break;

      case 'delete-profile':
        await this._deleteProfile(e.target.dataset.profileId);
        break;

      case 'delete-community-profile':
        await this._deleteCommunityProfile(e.target.dataset.profileId);
        break;

      case 'learn-commands':
        this._modal = { type: 'learn-commands', profileId: e.target.dataset.profileId };
        this._learningState = null;
        this._learnInputPorts = [];
        // Load input ports for the first board
        if (this._boards.length > 0) {
          await this._loadLearnInputPorts(this._boards[0].board_id);
        }
        this._render();
        break;

      case 'learn-command':
        await this._startLearning(e.target.dataset.command);
        break;

      case 'learn-board-changed':
        const selectedBoardId = e.target.value;
        await this._loadLearnInputPorts(selectedBoardId);
        this._render();
        break;

      case 'create-device':
        this._modal = { type: 'create-device' };
        this._deviceOutputPorts = [];
        // Load output ports for the first board
        if (this._boards.length > 0) {
          await this._loadDeviceOutputPorts(this._boards[0].board_id);
        }
        this._render();
        break;

      case 'device-board-changed':
        const deviceBoardId = e.target.value;
        // Preserve form values before re-render
        this._modal.formData = {
          deviceId: this.shadowRoot.getElementById('device-id')?.value || '',
          deviceName: this.shadowRoot.getElementById('device-name')?.value || '',
          deviceLocation: this.shadowRoot.getElementById('device-location')?.value || '',
          deviceProfile: this.shadowRoot.getElementById('device-profile')?.value || '',
          selectedBoard: deviceBoardId
        };
        await this._loadDeviceOutputPorts(deviceBoardId);
        this._render();
        break;

      case 'toggle-matrix-link':
        const matrixOptions = this.shadowRoot.getElementById('matrix-link-options');
        if (matrixOptions) {
          matrixOptions.style.display = e.target.checked ? 'block' : 'none';
        }
        break;

      case 'matrix-device-changed':
        await this._updateMatrixPortOptions(e.target.value);
        break;

      case 'matrix-type-changed':
        const matrixId = this.shadowRoot.getElementById('device-matrix-id')?.value;
        await this._updateMatrixPortOptions(matrixId);
        break;

      case 'save-device':
        await this._saveDevice();
        break;

      case 'delete-device':
        await this._deleteDevice(e.target.dataset.deviceId);
        break;

      case 'edit-device':
        await this._openEditDeviceModal(e.target.dataset.deviceId);
        break;

      case 'update-device':
        await this._updateDevice();
        break;

      case 'edit-matrix-device-changed':
        const editMatrixIdSelect = this.shadowRoot.getElementById('edit-device-matrix-id');
        const editSelectedOption = editMatrixIdSelect?.options[editMatrixIdSelect.selectedIndex];
        await this._updateEditMatrixPortOptions(e.target.value, editSelectedOption?.dataset.type);
        break;

      case 'edit-matrix-type-changed':
        const editMatrixId = this.shadowRoot.getElementById('edit-device-matrix-id')?.value;
        const editMatrixOption = this.shadowRoot.getElementById('edit-device-matrix-id')?.options[this.shadowRoot.getElementById('edit-device-matrix-id')?.selectedIndex];
        await this._updateEditMatrixPortOptions(editMatrixId, editMatrixOption?.dataset.type);
        break;

      case 'test-device':
        // Open remote control modal instead of just testing power
        this._modal = { type: 'remote-control', deviceId: e.target.dataset.deviceId };
        this._render();
        break;

      case 'send-remote-cmd':
        await this._sendRemoteCommand(e.target.dataset.command);
        break;

      case 'send-ha-remote-cmd':
        const cmdBtn = e.target.closest('[data-command]');
        if (cmdBtn && cmdBtn.dataset.command) {
          await this._sendHARemoteCommand(cmdBtn.dataset.command);
        }
        break;

      case 'test-screen-cmd':
        await this._testScreenCommand(e.target.dataset.screenId, e.target.dataset.cmd);
        break;

      case 'test-timed-down':
        await this._testTimedDown(e.target.dataset.screenId);
        break;

      case 'close-modal':
        this._modal = null;
        this._learningState = null;
        this._render();
        break;

      case 'use-builtin-profile':
        // Open device creation modal with this profile pre-selected
        this._modal = { type: 'create-device', preselectedProfile: `builtin:${e.target.dataset.profileId}` };
        this._deviceOutputPorts = [];
        if (this._boards.length > 0) {
          await this._loadDeviceOutputPorts(this._boards[0].board_id);
        }
        this._render();
        break;

      case 'use-community-profile':
        // Open device creation modal with this community profile pre-selected
        this._modal = { type: 'create-device', preselectedProfile: `community:${e.target.dataset.profileId}` };
        this._deviceOutputPorts = [];
        if (this._boards.length > 0) {
          await this._loadDeviceOutputPorts(this._boards[0].board_id);
        }
        this._render();
        break;

      case 'sync-community-profiles':
        await this._syncCommunityProfiles();
        break;

      case 'download-profile':
        await this._downloadCommunityProfile(e.target.dataset.profileId);
        break;

      case 'sync-network-drivers':
        await this._syncNetworkDrivers();
        break;

      case 'discover-devices':
        await this._discoverNetworkDevices();
        break;

      case 'add-discovered-device':
        const deviceData = JSON.parse(e.target.dataset.device);
        this._modal = {
          type: 'create-network-device',
          discoveredDevice: deviceData
        };
        this._render();
        break;

      case 'select-driver':
        this._selectedDriver = e.target.closest('[data-driver-id]').dataset.driverId;
        this._render();
        break;

      case 'use-driver':
        const driverId = e.target.dataset.driverId;
        const driver = this._networkDrivers.find(d => d.driver_id === driverId);
        if (driver) {
          this._modal = { type: 'create-network-device', driver: driver };
          this._render();
        }
        break;

      case 'export-profile':
        await this._exportProfileForContribution(e.target.dataset.profileId);
        break;

      case 'close-export-modal':
        this._exportModal = null;
        this._render();
        break;

      case 'toggle-section':
        const section = e.target.closest('[data-section]')?.dataset.section;
        if (section && this._expandedSections.hasOwnProperty(section)) {
          this._expandedSections[section] = !this._expandedSections[section];
          this._render();
        }
        break;

      case 'copy-export-json':
        const textarea = this.shadowRoot.getElementById('export-json');
        if (textarea) {
          textarea.select();
          document.execCommand('copy');
          // notification removed;
        }
        break;

      case 'filter-builtin':
        await this._filterBuiltinProfiles(e.target.value);
        break;

      // Network device actions
      case 'create-network-device':
        this._modal = { type: 'create-network-device' };
        this._render();
        break;

      case 'select-network-device':
        this._selectedNetworkDevice = e.target.closest('[data-device-id]').dataset.deviceId;
        // Load full device details including commands
        const deviceDetails = await this._loadNetworkDevice(this._selectedNetworkDevice);
        if (deviceDetails) {
          // Update the device in our list with full commands
          const idx = this._networkDevices.findIndex(d => d.device_id === this._selectedNetworkDevice);
          if (idx >= 0) {
            this._networkDevices[idx] = { ...this._networkDevices[idx], commands: deviceDetails.commands };
          }
        }
        this._render();
        break;

      case 'edit-network-device':
        e.stopPropagation();
        this._selectedNetworkDevice = e.target.closest('[data-device-id]').dataset.deviceId;
        const details = await this._loadNetworkDevice(this._selectedNetworkDevice);
        if (details) {
          const index = this._networkDevices.findIndex(d => d.device_id === this._selectedNetworkDevice);
          if (index >= 0) {
            this._networkDevices[index] = { ...this._networkDevices[index], commands: details.commands };
          }
        }
        this._render();
        break;

      case 'delete-network-device':
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this network device?')) {
          await this._deleteNetworkDevice(e.target.closest('[data-device-id]').dataset.deviceId);
        }
        break;

      case 'test-connection':
        await this._testNetworkConnection();
        break;

      case 'network-device-type-changed':
        this._toggleMatrixConfigSection(e.target.value);
        break;

      case 'matrix-config-changed':
        this._updateMatrixIONames();
        break;

      case 'save-network-device':
        await this._saveNetworkDevice();
        break;

      case 'add-network-command':
        this._modal = { type: 'add-network-command', deviceId: e.target.dataset.deviceId };
        this._render();
        // Add event listeners for checkbox toggles after render
        setTimeout(() => {
          const isInputCheckbox = this.shadowRoot.getElementById('command-is-input');
          const isQueryCheckbox = this.shadowRoot.getElementById('command-is-query');
          if (isInputCheckbox) {
            isInputCheckbox.addEventListener('change', (evt) => {
              this.shadowRoot.getElementById('input-value-group').style.display = evt.target.checked ? 'block' : 'none';
            });
          }
          if (isQueryCheckbox) {
            isQueryCheckbox.addEventListener('change', (evt) => {
              this.shadowRoot.getElementById('response-pattern-group').style.display = evt.target.checked ? 'block' : 'none';
              this.shadowRoot.getElementById('state-key-group').style.display = evt.target.checked ? 'block' : 'none';
            });
          }
        }, 0);
        break;

      case 'save-network-command':
        await this._saveNetworkCommand(e.target.dataset.deviceId);
        break;

      case 'send-network-command':
        await this._sendNetworkCommand(e.target.dataset.deviceId, e.target.dataset.commandId);
        break;

      case 'delete-network-command':
        if (confirm('Delete this command?')) {
          await this._deleteNetworkCommand(e.target.dataset.deviceId, e.target.dataset.commandId);
        }
        break;

      case 'test-network-device':
        e.stopPropagation();
        await this._testNetworkDevice(e.target.closest('[data-device-id]').dataset.deviceId);
        break;

      case 'edit-matrix-io':
        e.stopPropagation();
        const matrixDeviceId = e.target.closest('[data-device-id]').dataset.deviceId;
        const matrixDeviceType = e.target.dataset.deviceType; // 'network' or 'serial'
        await this._openEditMatrixModal(matrixDeviceId, matrixDeviceType);
        break;

      case 'save-matrix-io':
        await this._saveMatrixIO();
        break;

      // Serial device actions
      case 'create-serial-device':
        this._modal = { type: 'create-serial-device' };
        await this._loadAvailableSerialPorts();
        this._render();
        // Add mode and profile change listeners after render
        setTimeout(() => {
          const modeSelect = this.shadowRoot.getElementById('serial-device-mode');
          if (modeSelect) {
            modeSelect.addEventListener('change', (evt) => {
              const directFields = this.shadowRoot.getElementById('serial-direct-fields');
              const bridgeFields = this.shadowRoot.getElementById('serial-bridge-fields');
              if (evt.target.value === 'direct') {
                directFields.style.display = 'block';
                bridgeFields.style.display = 'none';
              } else {
                directFields.style.display = 'none';
                bridgeFields.style.display = 'block';
              }
            });
          }
          // Add profile change listener to auto-fill settings
          const profileSelect = this.shadowRoot.getElementById('serial-device-profile');
          if (profileSelect) {
            profileSelect.addEventListener('change', (evt) => {
              const option = evt.target.selectedOptions[0];
              if (option && option.value) {
                const baudRate = option.dataset.baud;
                const deviceType = option.dataset.type;
                if (baudRate) {
                  const baudSelect = this.shadowRoot.getElementById('serial-device-baud');
                  if (baudSelect) baudSelect.value = baudRate;
                }
                if (deviceType) {
                  const typeSelect = this.shadowRoot.getElementById('serial-device-type');
                  if (typeSelect) typeSelect.value = deviceType;
                }
              }
            });
          }
        }, 0);
        break;

      case 'select-serial-device':
        this._selectedSerialDevice = e.target.closest('[data-device-id]').dataset.deviceId;
        const serialDetails = await this._loadSerialDevice(this._selectedSerialDevice);
        if (serialDetails) {
          const idx = this._serialDevices.findIndex(d => d.device_id === this._selectedSerialDevice);
          if (idx >= 0) {
            this._serialDevices[idx] = { ...this._serialDevices[idx], commands: serialDetails.commands };
          }
        }
        this._render();
        break;

      case 'edit-serial-device':
        e.stopPropagation();
        this._selectedSerialDevice = e.target.closest('[data-device-id]').dataset.deviceId;
        const serialDet = await this._loadSerialDevice(this._selectedSerialDevice);
        if (serialDet) {
          const index = this._serialDevices.findIndex(d => d.device_id === this._selectedSerialDevice);
          if (index >= 0) {
            this._serialDevices[index] = { ...this._serialDevices[index], commands: serialDet.commands };
          }
        }
        this._render();
        break;

      case 'delete-serial-device':
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this serial device?')) {
          await this._deleteSerialDevice(e.target.closest('[data-device-id]').dataset.deviceId);
        }
        break;

      case 'save-serial-device':
        await this._saveSerialDevice();
        break;

      case 'add-serial-command':
        this._modal = { type: 'add-serial-command', deviceId: e.target.dataset.deviceId };
        this._render();
        // Add checkbox listeners after render
        setTimeout(() => {
          const isInputCheckbox = this.shadowRoot.getElementById('serial-command-is-input');
          const isQueryCheckbox = this.shadowRoot.getElementById('serial-command-is-query');
          if (isInputCheckbox) {
            isInputCheckbox.addEventListener('change', (evt) => {
              this.shadowRoot.getElementById('serial-input-value-group').style.display = evt.target.checked ? 'block' : 'none';
            });
          }
          if (isQueryCheckbox) {
            isQueryCheckbox.addEventListener('change', (evt) => {
              this.shadowRoot.getElementById('serial-response-pattern-group').style.display = evt.target.checked ? 'block' : 'none';
              this.shadowRoot.getElementById('serial-state-key-group').style.display = evt.target.checked ? 'block' : 'none';
            });
          }
        }, 0);
        break;

      case 'save-serial-command':
        await this._saveSerialCommand(e.target.dataset.deviceId);
        break;

      case 'send-serial-command':
        await this._sendSerialCommand(e.target.dataset.deviceId, e.target.dataset.commandId);
        break;

      case 'delete-serial-command':
        if (confirm('Delete this command?')) {
          await this._deleteSerialCommand(e.target.dataset.deviceId, e.target.dataset.commandId);
        }
        break;

      case 'test-serial-device':
        e.stopPropagation();
        await this._testSerialDevice(e.target.closest('[data-device-id]').dataset.deviceId);
        break;

      // Device group actions
      case 'create-group':
        this._modal = { type: 'create-group' };
        this._render();
        break;

      case 'edit-group':
        const groupId = e.target.closest('[data-group-id]').dataset.groupId;
        const groupToEdit = this._deviceGroups.find(g => g.group_id === groupId);
        if (groupToEdit) {
          this._modal = { type: 'edit-group', group: groupToEdit };
          this._render();
        }
        break;

      case 'delete-group':
        if (confirm('Delete this device group?')) {
          await this._deleteDeviceGroup(e.target.closest('[data-group-id]').dataset.groupId);
        }
        break;

      case 'group-power-on':
        await this._sendGroupPower(e.target.closest('[data-group-id]').dataset.groupId, 'on');
        break;

      case 'group-power-off':
        await this._sendGroupPower(e.target.closest('[data-group-id]').dataset.groupId, 'off');
        break;

      case 'save-group':
        await this._saveDeviceGroup();
        break;

      // HA device actions
      case 'create-ha-device':
        this._modal = { type: 'create-ha-device' };
        await this._loadHAEntities();
        this._render();
        break;

      case 'edit-ha-device':
        const haDeviceId = e.target.closest('[data-device-id]').dataset.deviceId;
        const haDevice = this._haDevices.find(d => d.device_id === haDeviceId);
        if (haDevice) {
          this._modal = { type: 'edit-ha-device', device: haDevice };
          await this._loadHAEntities();
          this._render();
        }
        break;

      case 'delete-ha-device':
        if (confirm('Delete this HA device?')) {
          await this._deleteHADevice(e.target.closest('[data-device-id]').dataset.deviceId);
        }
        break;

      case 'save-ha-device':
        await this._saveHADevice();
        break;

      case 'test-ha-device':
        this._modal = { type: 'ha-remote-control', deviceId: e.target.closest('[data-device-id]').dataset.deviceId };
        this._render();
        break;

      case 'toggle-ha-matrix-link':
        const haMatrixOptions = this.shadowRoot.getElementById('ha-matrix-link-options');
        if (haMatrixOptions) {
          haMatrixOptions.style.display = e.target.checked ? 'block' : 'none';
        }
        break;

      case 'ha-matrix-device-changed':
        await this._updateHAMatrixPortOptions(e.target.value);
        break;
    }
  }

  async _filterBuiltinProfiles(deviceType) {
    try {
      const url = deviceType
        ? `/api/vda_ir_control/builtin_profiles?device_type=${deviceType}`
        : '/api/vda_ir_control/builtin_profiles';
      const resp = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        this._builtinProfiles = data.profiles || [];
      }
      this._render();
    } catch (e) {
      console.error('Failed to filter profiles:', e);
    }
  }

  async _savePort(portNum) {
    const mode = this.shadowRoot.getElementById('port-mode').value;
    const name = this.shadowRoot.getElementById('port-name').value;

    try {
      await this._hass.callService('vda_ir_control', 'configure_port', {
        board_id: this._selectedBoard,
        port: portNum,
        mode: mode,
        name: name,
      });
      this._modal = null;
      await this._loadPorts(this._selectedBoard);
    } catch (e) {
      console.error('Failed to save port:', e);
      alert('Failed to save port configuration');
    }
  }

  async _saveProfile() {
    const profileId = this.shadowRoot.getElementById('profile-id').value;
    const name = this.shadowRoot.getElementById('profile-name').value;
    const deviceType = this.shadowRoot.getElementById('device-type').value;
    const manufacturer = this.shadowRoot.getElementById('manufacturer').value;
    const model = this.shadowRoot.getElementById('model').value;

    if (!profileId || !name) {
      alert('Please fill in Profile ID and Name');
      return;
    }

    try {
      await this._hass.callService('vda_ir_control', 'create_profile', {
        profile_id: profileId,
        name: name,
        device_type: deviceType,
        manufacturer: manufacturer,
        model: model,
      });
      this._modal = null;
      await this._loadProfiles();
      this._render();
    } catch (e) {
      console.error('Failed to create profile:', e);
      alert('Failed to create profile');
    }
  }

  async _deleteProfile(profileId) {
    if (!confirm(`Delete profile "${profileId}"?`)) return;

    try {
      const response = await this._hass.callWS({
        type: 'call_service',
        domain: 'vda_ir_control',
        service: 'delete_profile',
        service_data: { profile_id: profileId },
        return_response: false,
      });
      await this._loadProfiles();
      this._render();
    } catch (e) {
      // Try API fallback
      try {
        await fetch(`/api/vda_ir_control/profiles/${profileId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${this._hass.auth.data.access_token}` },
        });
        await this._loadProfiles();
        this._render();
      } catch (e2) {
        console.error('Failed to delete profile:', e2);
        alert('Failed to delete profile');
      }
    }
  }

  async _deleteCommunityProfile(profileId) {
    if (!confirm(`Remove "${profileId}" from local cache? You can re-download it later.`)) return;

    try {
      const response = await fetch(`/api/vda_ir_control/delete_community_profile/${profileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this._hass.auth.data.access_token}` },
      });
      const result = await response.json();
      if (result.success) {
        await this._loadCommunityProfiles();
        this._render();
      } else {
        alert(`Failed to delete: ${result.message}`);
      }
    } catch (e) {
      console.error('Failed to delete community profile:', e);
      alert('Failed to delete community profile');
    }
  }

  async _startLearning(command) {
    const boardId = this.shadowRoot.getElementById('learn-board').value;
    const portSelect = this.shadowRoot.getElementById('learn-port');
    const port = parseInt(portSelect.value);

    if (!port || isNaN(port)) {
      alert('Please configure an IR input port on this board first.\n\nGo to Boards tab → Configure Ports → Set a GPIO as "IR Input"');
      return;
    }

    try {
      await this._hass.callService('vda_ir_control', 'start_learning', {
        board_id: boardId,
        profile_id: this._modal.profileId,
        command: command,
        port: port,
        timeout: 15,
      });

      this._learningState = { command: command, active: true };
      this._render();

      // Poll for result
      this._pollLearningStatus(boardId);
    } catch (e) {
      console.error('Failed to start learning:', e);
      alert('Failed to start learning mode');
    }
  }

  async _pollLearningStatus(boardId) {
    const maxAttempts = 30;
    let attempts = 0;

    const poll = async () => {
      if (!this._learningState?.active || !this._modal) return;

      try {
        const resp = await fetch(`/api/vda_ir_control/learning/${boardId}`, {
          headers: {
            'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
          },
        });

        if (!resp.ok) {
          throw new Error('Failed to get status');
        }

        const status = await resp.json();

        if (status?.saved) {
          this._learningState = { ...this._learningState, saved: true, active: false };
          await this._loadProfiles();
          this._render();
          return;
        }

        if (status?.received_code) {
          this._learningState = { ...this._learningState, saved: true, active: false };
          await this._loadProfiles();
          this._render();
          return;
        }

        attempts++;
        if (attempts < maxAttempts && this._learningState?.active) {
          setTimeout(poll, 500);
        } else {
          this._learningState = null;
          this._render();
        }
      } catch (e) {
        console.error('Failed to get learning status:', e);
      }
    };

    poll();
  }

  async _saveDevice() {
    const deviceId = this.shadowRoot.getElementById('device-id').value;
    const name = this.shadowRoot.getElementById('device-name').value;
    const location = this.shadowRoot.getElementById('device-location').value;
    const profileId = this.shadowRoot.getElementById('device-profile').value;
    const boardId = this.shadowRoot.getElementById('device-board').value;
    const portSelect = this.shadowRoot.getElementById('device-port');
    const port = parseInt(portSelect.value);

    // Matrix link fields
    const linkMatrixCheckbox = this.shadowRoot.getElementById('device-link-matrix');
    const linkMatrix = linkMatrixCheckbox ? linkMatrixCheckbox.checked : false;
    const matrixIdSelect = this.shadowRoot.getElementById('device-matrix-id');
    const matrixTypeSelect = this.shadowRoot.getElementById('device-matrix-type');
    const matrixPortSelect = this.shadowRoot.getElementById('device-matrix-port');

    if (!deviceId || !name || !profileId || !boardId) {
      alert('Please fill in all required fields');
      return;
    }

    if (!port || isNaN(port)) {
      alert('Please configure an IR output port on this board first.\n\nGo to Boards tab → Configure Ports → Set a GPIO as "IR Output"');
      return;
    }

    // Build service data
    const serviceData = {
      device_id: deviceId,
      name: name,
      location: location,
      profile_id: profileId,
      board_id: boardId,
      output_port: port,
    };

    // Add matrix link data if enabled
    if (linkMatrix && matrixIdSelect && matrixIdSelect.value) {
      const selectedOption = matrixIdSelect.options[matrixIdSelect.selectedIndex];
      const isInputDevice = matrixTypeSelect?.value === 'input';
      serviceData.matrix_device_id = matrixIdSelect.value;
      serviceData.matrix_device_type = selectedOption.dataset.type;
      serviceData.matrix_port_type = isInputDevice ? 'input' : 'output';
      serviceData.matrix_port = matrixPortSelect ? matrixPortSelect.value : null;
    }

    try {
      await this._hass.callService('vda_ir_control', 'create_device', serviceData);
      this._modal = null;
      await this._loadDevices();
      this._render();
    } catch (e) {
      console.error('Failed to create device:', e);
      alert('Failed to create device');
    }
  }

  async _deleteDevice(deviceId) {
    if (!confirm(`Delete device "${deviceId}"?`)) return;

    try {
      await this._hass.callService('vda_ir_control', 'delete_device', {
        device_id: deviceId,
      });
      await this._loadDevices();
      this._render();
    } catch (e) {
      console.error('Failed to delete device:', e);
      alert('Failed to delete device');
    }
  }

  async _sendRemoteCommand(command) {
    if (!this._modal || !this._modal.deviceId) return;

    try {
      await this._hass.callService('vda_ir_control', 'send_command', {
        device_id: this._modal.deviceId,
        command: command,
      });
      // Update modal to show last sent command
      this._modal.lastSent = command;
      this._render();

      // Clear the "sent" indicator after 1.5 seconds
      setTimeout(() => {
        if (this._modal && this._modal.lastSent === command) {
          this._modal.lastSent = null;
          this._render();
        }
      }, 1500);
    } catch (e) {
      console.error('Failed to send command:', e);
      alert(`Failed to send ${command}`);
    }
  }

  async _sendHARemoteCommand(command) {
    if (!this._modal || !this._modal.deviceId) return;

    try {
      await this._hass.callService('vda_ir_control', 'send_ha_command', {
        device_id: this._modal.deviceId,
        command: command,
      });
      // Update modal to show last sent command
      this._modal.lastSent = command;
      this._render();

      // Clear the "sent" indicator after 1.5 seconds
      setTimeout(() => {
        if (this._modal && this._modal.lastSent === command) {
          this._modal.lastSent = null;
          this._render();
        }
      }, 1500);
    } catch (e) {
      console.error('Failed to send HA command:', e);
      alert(`Failed to send ${command}`);
    }
  }

  async _testScreenCommand(screenId, command) {
    if (!screenId || !command) return;

    try {
      await this._hass.callService('vda_ir_control', 'send_command', {
        device_id: screenId,
        command: command,
      });
    } catch (e) {
      console.error('Failed to send screen command:', e);
      alert(`Failed to send screen ${command}`);
    }
  }

  async _testTimedDown(screenId) {
    if (!screenId) return;

    // Get the delay from the input field
    const delayInput = this.shadowRoot.getElementById('edit-device-screen-delay');
    const delay = delayInput?.value ? parseFloat(delayInput.value) : 0;

    try {
      // Send down command
      await this._hass.callService('vda_ir_control', 'send_command', {
        device_id: screenId,
        command: 'down',
      });

      if (delay > 0) {
        // Wait for the delay, then send stop
        setTimeout(async () => {
          try {
            await this._hass.callService('vda_ir_control', 'send_command', {
              device_id: screenId,
              command: 'stop',
            });
          } catch (e) {
            console.error('Failed to send screen stop:', e);
            alert('Failed to send screen stop');
          }
        }, delay * 1000);
      }
    } catch (e) {
      console.error('Failed to send timed down:', e);
      alert('Failed to send timed down');
    }
  }

  // ========== Network Device Methods ==========

  async _testNetworkConnection() {
    const hostEl = this.shadowRoot.getElementById('network-device-host');
    const portEl = this.shadowRoot.getElementById('network-device-port');
    const protocolEl = this.shadowRoot.getElementById('network-device-protocol');
    const resultSpan = this.shadowRoot.getElementById('test-connection-result');

    const host = hostEl ? hostEl.value.trim() : '';
    const portValue = portEl ? portEl.value : '';
    const port = parseInt(portValue, 10);
    const protocol = protocolEl ? protocolEl.value : 'tcp';

    if (!host) {
      resultSpan.textContent = 'Enter IP address first';
      resultSpan.style.color = 'var(--error-color, #f44336)';
      return;
    }

    if (isNaN(port) || port <= 0 || port > 65535) {
      resultSpan.textContent = `Invalid port: ${portValue}`;
      resultSpan.style.color = 'var(--error-color, #f44336)';
      return;
    }

    resultSpan.textContent = 'Testing...';
    resultSpan.style.color = 'var(--secondary-text-color)';

    try {
      // Get auth token - try multiple paths for compatibility
      const token = this._hass?.auth?.data?.access_token ||
                   this._hass?.connection?.options?.auth?.accessToken || '';

      if (!token) {
        resultSpan.textContent = 'Auth error - please refresh the page';
        resultSpan.style.color = 'var(--error-color, #f44336)';
        return;
      }

      const resp = await fetch('/api/vda_ir_control/test_connection', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ host, port, protocol }),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        resultSpan.textContent = `HTTP ${resp.status}: ${errorText.substring(0, 50)}`;
        resultSpan.style.color = 'var(--error-color, #f44336)';
        return;
      }

      const result = await resp.json();
      resultSpan.textContent = result.success ? 'Connected!' : (result.message || 'Connection failed');
      resultSpan.style.color = result.success ? 'var(--success-color, #4caf50)' : 'var(--error-color, #f44336)';
    } catch (e) {
      console.error('Test connection error:', e);
      resultSpan.textContent = 'Test failed: ' + e.message;
      resultSpan.style.color = 'var(--error-color, #f44336)';
    }
  }

  async _saveNetworkDevice() {
    const deviceIdEl = this.shadowRoot.getElementById('network-device-id');
    const nameEl = this.shadowRoot.getElementById('network-device-name');
    const hostEl = this.shadowRoot.getElementById('network-device-host');
    const portEl = this.shadowRoot.getElementById('network-device-port');
    const protocolEl = this.shadowRoot.getElementById('network-device-protocol');
    const deviceTypeEl = this.shadowRoot.getElementById('network-device-type');
    const locationEl = this.shadowRoot.getElementById('network-device-location');
    const driverIdEl = this.shadowRoot.getElementById('network-device-driver-id');

    const deviceId = deviceIdEl ? deviceIdEl.value.trim() : '';
    const name = nameEl ? nameEl.value.trim() : '';
    const host = hostEl ? hostEl.value.trim() : '';
    const portValue = portEl ? portEl.value : '';
    const port = parseInt(portValue, 10);
    const protocol = protocolEl ? protocolEl.value : 'tcp';
    const deviceType = deviceTypeEl ? deviceTypeEl.value : 'custom';
    const location = locationEl ? locationEl.value.trim() : '';
    const driverId = driverIdEl ? driverIdEl.value : null;

    if (!deviceId || !name || !host) {
      alert('Please fill in Device ID, Name, and IP Address');
      return;
    }

    if (isNaN(port) || port <= 0 || port > 65535) {
      alert(`Invalid port number: ${portValue}`);
      return;
    }

    // Get auth token - try multiple paths for compatibility
    const token = this._hass?.auth?.data?.access_token ||
                 this._hass?.connection?.options?.auth?.accessToken || '';

    if (!token) {
      alert('Authentication error - please refresh the page');
      return;
    }

    // Get matrix configuration if applicable
    const matrixConfig = this._getMatrixConfig();

    try {
      let resp;
      if (driverId) {
        // Create from driver using the driver API
        resp = await fetch('/api/vda_ir_control/create_from_driver', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            driver_id: driverId,
            device_id: deviceId,
            name,
            ip_address: host,
            port,
            location,
            matrix_inputs: matrixConfig?.inputs,
            matrix_outputs: matrixConfig?.outputs,
          }),
        });
      } else {
        // Create manually without driver
        resp = await fetch('/api/vda_ir_control/network_devices', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            device_id: deviceId,
            name,
            host,
            port,
            protocol,
            device_type: deviceType,
            location,
            matrix_config: matrixConfig,
          }),
        });
      }

      if (resp.ok) {
        this._modal = null;
        // notification removed;
        await this._loadNetworkDevices();
        this._render();
      } else {
        let errorMsg = `HTTP ${resp.status}`;
        try {
          const error = await resp.json();
          errorMsg = error.error || error.message || errorMsg;
        } catch {
          const errorText = await resp.text();
          errorMsg = errorText.substring(0, 100) || errorMsg;
        }
        alert('Failed to create device: ' + errorMsg);
      }
    } catch (e) {
      console.error('Failed to create network device:', e);
      alert('Failed to create device: ' + e.message);
    }
  }

  async _deleteNetworkDevice(deviceId) {
    try {
      const resp = await fetch(`/api/vda_ir_control/network_devices/${deviceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });

      if (resp.ok) {
        if (this._selectedNetworkDevice === deviceId) {
          this._selectedNetworkDevice = null;
        }
        await this._loadNetworkDevices();
        this._render();
      } else {
        alert('Failed to delete device');
      }
    } catch (e) {
      console.error('Failed to delete network device:', e);
      alert('Failed to delete device');
    }
  }

  async _saveNetworkCommand(deviceId) {
    const commandId = this.shadowRoot.getElementById('command-id').value.trim();
    const name = this.shadowRoot.getElementById('command-name').value.trim();
    const payload = this.shadowRoot.getElementById('command-payload').value;
    const format = this.shadowRoot.getElementById('command-format').value;
    const lineEnding = this.shadowRoot.getElementById('command-line-ending').value;
    const isInput = this.shadowRoot.getElementById('command-is-input').checked;
    const inputValue = this.shadowRoot.getElementById('command-input-value')?.value || '';
    const isQuery = this.shadowRoot.getElementById('command-is-query').checked;
    const responsePattern = this.shadowRoot.getElementById('command-response-pattern')?.value || '';
    const stateKey = this.shadowRoot.getElementById('command-state-key')?.value || '';

    if (!commandId || !name || !payload) {
      alert('Please fill in command ID, name, and payload');
      return;
    }

    try {
      const resp = await fetch(`/api/vda_ir_control/network_devices/${deviceId}/commands`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command_id: commandId,
          name,
          payload,
          format,
          line_ending: lineEnding,
          is_input_option: isInput,
          input_value: inputValue,
          is_query: isQuery,
          response_pattern: responsePattern,
          response_state_key: stateKey,
        }),
      });

      if (resp.ok) {
        this._modal = null;
        // Reload device details
        const details = await this._loadNetworkDevice(deviceId);
        if (details) {
          const index = this._networkDevices.findIndex(d => d.device_id === deviceId);
          if (index >= 0) {
            this._networkDevices[index] = { ...this._networkDevices[index], commands: details.commands };
          }
        }
        this._render();
      } else {
        const error = await resp.json();
        alert('Failed to add command: ' + (error.error || 'Unknown error'));
      }
    } catch (e) {
      console.error('Failed to add command:', e);
      alert('Failed to add command');
    }
  }

  async _deleteNetworkCommand(deviceId, commandId) {
    try {
      const resp = await fetch(`/api/vda_ir_control/network_devices/${deviceId}/commands/${commandId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });

      if (resp.ok) {
        // Reload device details
        const details = await this._loadNetworkDevice(deviceId);
        if (details) {
          const index = this._networkDevices.findIndex(d => d.device_id === deviceId);
          if (index >= 0) {
            this._networkDevices[index] = { ...this._networkDevices[index], commands: details.commands };
          }
        }
        this._render();
      } else {
        alert('Failed to delete command');
      }
    } catch (e) {
      console.error('Failed to delete command:', e);
      alert('Failed to delete command');
    }
  }

  async _sendNetworkCommand(deviceId, commandId) {
    this._networkTestResult = null;
    this._render();

    try {
      // Get auth token - try multiple paths for compatibility
      const token = this._hass?.auth?.data?.access_token ||
                   this._hass?.connection?.options?.auth?.accessToken || '';

      const resp = await fetch(`/api/vda_ir_control/network_devices/${deviceId}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command_id: commandId,
          wait_for_response: true,
          timeout: 2.0,
        }),
      });

      const result = await resp.json();
      this._networkTestResult = {
        success: result.success,
        response: result.response,
        message: result.error || null,
      };
      this._render();

      // Clear result after 5 seconds
      setTimeout(() => {
        this._networkTestResult = null;
        this._render();
      }, 5000);
    } catch (e) {
      console.error('Failed to send command:', e);
      this._networkTestResult = {
        success: false,
        message: 'Failed to send command: ' + e.message,
      };
      this._render();
    }
  }

  async _testNetworkDevice(deviceId) {
    this._networkTestResult = { success: true, message: 'Checking connection...' };
    this._render();

    try {
      const device = this._networkDevices.find(d => d.device_id === deviceId);
      if (!device) {
        this._networkTestResult = { success: false, message: 'Device not found' };
        this._render();
        return;
      }

      // Get auth token - try multiple paths for compatibility
      const token = this._hass?.auth?.data?.access_token ||
                   this._hass?.connection?.options?.auth?.accessToken || '';

      if (!token) {
        this._networkTestResult = { success: false, message: 'Auth error - refresh page' };
        this._render();
        return;
      }

      const resp = await fetch('/api/vda_ir_control/test_connection', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host: device.host,
          port: device.port,
          protocol: device.protocol || 'tcp',
        }),
      });

      if (!resp.ok) {
        let errorMsg = `HTTP ${resp.status}`;
        try {
          const error = await resp.json();
          errorMsg = error.error || error.message || errorMsg;
        } catch {
          errorMsg = await resp.text() || errorMsg;
        }
        this._networkTestResult = { success: false, message: errorMsg };
        this._render();
        return;
      }

      const result = await resp.json();
      this._networkTestResult = result;
      this._render();

      // Clear result after 5 seconds
      setTimeout(() => {
        this._networkTestResult = null;
        this._render();
      }, 5000);
    } catch (e) {
      console.error('Failed to test device:', e);
      this._networkTestResult = {
        success: false,
        message: 'Test failed: ' + e.message,
      };
      this._render();
    }
  }

  // ========== Serial Device Methods ==========

  async _saveSerialDevice() {
    const deviceId = this.shadowRoot.getElementById('serial-device-id').value.trim();
    const name = this.shadowRoot.getElementById('serial-device-name').value.trim();
    const mode = this.shadowRoot.getElementById('serial-device-mode').value;
    const deviceType = this.shadowRoot.getElementById('serial-device-type').value;
    const location = this.shadowRoot.getElementById('serial-device-location').value.trim();
    const baudRate = parseInt(this.shadowRoot.getElementById('serial-device-baud').value);
    const dataBits = parseInt(this.shadowRoot.getElementById('serial-device-data-bits').value);
    const parity = this.shadowRoot.getElementById('serial-device-parity').value;
    const stopBits = parseInt(this.shadowRoot.getElementById('serial-device-stop-bits').value);
    const profileId = this.shadowRoot.getElementById('serial-device-profile').value;

    if (!deviceId || !name) {
      alert('Please fill in Device ID and Name');
      return;
    }

    const deviceData = {
      device_id: deviceId,
      name,
      mode,
      device_type: deviceType,
      location,
      baud_rate: baudRate,
      data_bits: dataBits,
      parity,
      stop_bits: stopBits,
    };

    if (mode === 'direct') {
      const portSelect = this.shadowRoot.getElementById('serial-device-port').value;
      const portManual = this.shadowRoot.getElementById('serial-device-port-manual').value.trim();
      deviceData.port = portManual || portSelect;
      if (!deviceData.port) {
        alert('Please enter or select a serial port');
        return;
      }
    } else {
      deviceData.bridge_board_id = this.shadowRoot.getElementById('serial-device-board').value;
      deviceData.uart_num = parseInt(this.shadowRoot.getElementById('serial-device-uart').value);
      deviceData.rx_pin = parseInt(this.shadowRoot.getElementById('serial-device-rx-pin').value);
      deviceData.tx_pin = parseInt(this.shadowRoot.getElementById('serial-device-tx-pin').value);
      if (!deviceData.bridge_board_id) {
        alert('Please select an ESP32 board');
        return;
      }
    }

    try {
      const resp = await fetch('/api/vda_ir_control/serial_devices', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(deviceData),
      });

      if (resp.ok) {
        // If a profile was selected, apply its commands to the device
        if (profileId) {
          await this._applySerialProfileToDevice(deviceId, profileId);
        }
        this._modal = null;
        await this._loadSerialDevices();
        this._render();
      } else {
        const error = await resp.json();
        alert('Failed to create device: ' + (error.error || 'Unknown error'));
      }
    } catch (e) {
      console.error('Failed to create serial device:', e);
      alert('Failed to create device');
    }
  }

  async _applySerialProfileToDevice(deviceId, profileId) {
    try {
      // Fetch profile apply data
      const profileResp = await fetch(`/api/vda_ir_control/serial_profiles/${profileId}/apply`, {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });

      if (!profileResp.ok) {
        console.error('Failed to fetch profile data');
        return;
      }

      const profileData = await profileResp.json();
      const commands = profileData.commands || {};

      // Add each command from the profile
      for (const [cmdId, cmd] of Object.entries(commands)) {
        await fetch(`/api/vda_ir_control/serial_devices/${deviceId}/commands`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(cmd),
        });
      }

      // If it's a matrix profile with routing/query templates, update the device
      if (profileData.routing_template || profileData.query_template) {
        await fetch(`/api/vda_ir_control/serial_devices/${deviceId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            routing_template: profileData.routing_template || '',
            query_template: profileData.query_template || '',
          }),
        });
      }

      console.log(`Applied profile ${profileId} to device ${deviceId}`);
    } catch (e) {
      console.error('Failed to apply profile to device:', e);
    }
  }

  async _deleteSerialDevice(deviceId) {
    try {
      const resp = await fetch(`/api/vda_ir_control/serial_devices/${deviceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });

      if (resp.ok) {
        if (this._selectedSerialDevice === deviceId) {
          this._selectedSerialDevice = null;
        }
        await this._loadSerialDevices();
        this._render();
      } else {
        alert('Failed to delete device');
      }
    } catch (e) {
      console.error('Failed to delete serial device:', e);
      alert('Failed to delete device');
    }
  }

  async _saveDeviceGroup() {
    const name = this.shadowRoot.getElementById('group-name').value.trim();
    const location = this.shadowRoot.getElementById('group-location').value.trim();
    const delay = parseInt(this.shadowRoot.getElementById('group-delay').value) || 20;

    if (!name) {
      alert('Please enter a group name');
      return;
    }

    // Collect selected devices
    const checkboxes = this.shadowRoot.querySelectorAll('.group-device-checkbox:checked');
    const members = Array.from(checkboxes).map(cb => ({
      device_id: cb.dataset.deviceId,
      device_type: cb.dataset.deviceType,
    }));

    if (members.length === 0) {
      alert('Please select at least one device for the group');
      return;
    }

    const isEdit = this._modal.type === 'edit-group';
    const groupId = isEdit ? this._modal.group.group_id : name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    const groupData = {
      group_id: groupId,
      name,
      location,
      sequence_delay_ms: delay,
      members,
    };

    try {
      const url = isEdit
        ? `/api/vda_ir_control/device_groups/${groupId}`
        : '/api/vda_ir_control/device_groups';
      const method = isEdit ? 'PUT' : 'POST';

      const resp = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(groupData),
      });

      if (resp.ok) {
        this._modal = null;
        await this._loadDeviceGroups();
        this._render();
      } else {
        const error = await resp.json();
        alert('Failed to save group: ' + (error.error || 'Unknown error'));
      }
    } catch (e) {
      console.error('Failed to save device group:', e);
      alert('Failed to save group');
    }
  }

  async _deleteDeviceGroup(groupId) {
    try {
      const resp = await fetch(`/api/vda_ir_control/device_groups/${groupId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });

      if (resp.ok) {
        await this._loadDeviceGroups();
        this._render();
      } else {
        alert('Failed to delete group');
      }
    } catch (e) {
      console.error('Failed to delete device group:', e);
      alert('Failed to delete group');
    }
  }

  async _sendGroupPower(groupId, action) {
    try {
      const resp = await fetch(`/api/vda_ir_control/device_groups/${groupId}/power`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });

      const data = await resp.json();
      if (resp.ok && data.success) {
        // Visual feedback
        const btn = this.shadowRoot.querySelector(`[data-action="group-power-${action}"][data-group-id="${groupId}"]`);
        if (btn) {
          const originalText = btn.textContent;
          btn.textContent = action === 'on' ? 'Sent!' : 'Sent!';
          btn.disabled = true;
          setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
          }, 1500);
        }
      } else {
        const errors = data.results?.filter(r => !r.success).map(r => r.error).join(', ') || 'Unknown error';
        alert(`Some devices failed: ${errors}`);
      }
    } catch (e) {
      console.error('Failed to send group power:', e);
      alert('Failed to send power command');
    }
  }

  async _saveSerialCommand(deviceId) {
    const commandId = this.shadowRoot.getElementById('serial-command-id').value.trim();
    const name = this.shadowRoot.getElementById('serial-command-name').value.trim();
    const payload = this.shadowRoot.getElementById('serial-command-payload').value;
    const format = this.shadowRoot.getElementById('serial-command-format').value;
    const lineEnding = this.shadowRoot.getElementById('serial-command-line-ending').value;
    const isInput = this.shadowRoot.getElementById('serial-command-is-input').checked;
    const inputValue = this.shadowRoot.getElementById('serial-command-input-value')?.value || '';
    const isQuery = this.shadowRoot.getElementById('serial-command-is-query').checked;
    const responsePattern = this.shadowRoot.getElementById('serial-command-response-pattern')?.value || '';
    const stateKey = this.shadowRoot.getElementById('serial-command-state-key')?.value || '';

    if (!commandId || !name || !payload) {
      alert('Please fill in command ID, name, and payload');
      return;
    }

    try {
      const resp = await fetch(`/api/vda_ir_control/serial_devices/${deviceId}/commands`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command_id: commandId,
          name,
          payload,
          format,
          line_ending: lineEnding,
          is_input_option: isInput,
          input_value: inputValue,
          is_query: isQuery,
          response_pattern: responsePattern,
          response_state_key: stateKey,
        }),
      });

      if (resp.ok) {
        this._modal = null;
        // Reload device details
        const details = await this._loadSerialDevice(deviceId);
        if (details) {
          const index = this._serialDevices.findIndex(d => d.device_id === deviceId);
          if (index >= 0) {
            this._serialDevices[index] = { ...this._serialDevices[index], commands: details.commands };
          }
        }
        this._render();
      } else {
        const error = await resp.json();
        alert('Failed to add command: ' + (error.error || 'Unknown error'));
      }
    } catch (e) {
      console.error('Failed to add command:', e);
      alert('Failed to add command');
    }
  }

  async _deleteSerialCommand(deviceId, commandId) {
    try {
      const resp = await fetch(`/api/vda_ir_control/serial_devices/${deviceId}/commands/${commandId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });

      if (resp.ok) {
        // Reload device details
        const details = await this._loadSerialDevice(deviceId);
        if (details) {
          const index = this._serialDevices.findIndex(d => d.device_id === deviceId);
          if (index >= 0) {
            this._serialDevices[index] = { ...this._serialDevices[index], commands: details.commands };
          }
        }
        this._render();
      } else {
        alert('Failed to delete command');
      }
    } catch (e) {
      console.error('Failed to delete serial command:', e);
      alert('Failed to delete command');
    }
  }

  async _sendSerialCommand(deviceId, commandId) {
    this._serialTestResult = null;
    this._render();

    try {
      const resp = await fetch(`/api/vda_ir_control/serial_devices/${deviceId}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command_id: commandId,
          wait_for_response: true,
          timeout: 2.0,
        }),
      });

      const result = await resp.json();
      this._serialTestResult = {
        success: result.success,
        response: result.response,
        message: result.error || null,
      };
      this._render();

      // Clear result after 5 seconds
      setTimeout(() => {
        this._serialTestResult = null;
        this._render();
      }, 5000);
    } catch (e) {
      console.error('Failed to send command:', e);
      this._serialTestResult = {
        success: false,
        message: 'Failed to send command: ' + e.message,
      };
      this._render();
    }
  }

  async _testSerialDevice(deviceId) {
    this._serialTestResult = { success: true, message: 'Testing connection...' };
    this._render();

    try {
      const device = this._serialDevices.find(d => d.device_id === deviceId);
      if (!device) return;

      // For serial devices, we check the state endpoint
      const resp = await fetch(`/api/vda_ir_control/serial_devices/${deviceId}/state`, {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });

      const result = await resp.json();
      this._serialTestResult = {
        success: result.connected,
        message: result.connected ? 'Device is connected' : 'Device is not connected',
      };
      this._render();

      // Clear result after 5 seconds
      setTimeout(() => {
        this._serialTestResult = null;
        this._render();
      }, 5000);
    } catch (e) {
      console.error('Failed to test device:', e);
      this._serialTestResult = {
        success: false,
        message: 'Test failed: ' + e.message,
      };
      this._render();
    }
  }

  // HA Device methods
  async _saveHADevice() {
    const isEdit = this._modal.type === 'edit-ha-device';
    const deviceId = isEdit ? this._modal.device.device_id : this.shadowRoot.getElementById('ha-device-id')?.value;
    const name = this.shadowRoot.getElementById('ha-device-name').value;
    const deviceFamily = this.shadowRoot.getElementById('ha-device-family').value;
    const entityId = this.shadowRoot.getElementById('ha-entity-id').value;
    const location = this.shadowRoot.getElementById('ha-device-location').value;
    const mediaPlayerEntityId = this.shadowRoot.getElementById('ha-media-player-entity')?.value || null;

    // Matrix linking
    const linkToMatrix = this.shadowRoot.getElementById('ha-link-to-matrix')?.checked;
    const matrixDeviceId = linkToMatrix ? this.shadowRoot.getElementById('ha-matrix-device-id')?.value : null;
    const matrixPort = linkToMatrix ? this.shadowRoot.getElementById('ha-matrix-port')?.value : null;

    if (!deviceId || !name || !entityId) {
      alert('Please fill in Device ID, Name, and Entity ID');
      return;
    }

    try {
      const payload = {
        device_id: deviceId,
        name,
        device_family: deviceFamily,
        entity_id: entityId,
        location,
        matrix_device_id: matrixDeviceId || null,
        matrix_device_type: matrixDeviceId ? 'serial' : null,
        matrix_port: matrixPort || null,
        media_player_entity_id: mediaPlayerEntityId,
      };

      const method = isEdit ? 'PUT' : 'POST';
      const url = isEdit
        ? `/api/vda_ir_control/ha_devices/${deviceId}`
        : '/api/vda_ir_control/ha_devices';

      const resp = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (resp.ok) {
        this._modal = null;
        await this._loadHADevices();
        this._render();
      } else {
        const error = await resp.json();
        alert('Failed to save HA device: ' + (error.error || 'Unknown error'));
      }
    } catch (e) {
      console.error('Failed to save HA device:', e);
      alert('Failed to save HA device');
    }
  }

  async _deleteHADevice(deviceId) {
    try {
      const resp = await fetch(`/api/vda_ir_control/ha_devices/${deviceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });

      if (resp.ok) {
        await this._loadHADevices();
        this._render();
      } else {
        const error = await resp.json();
        alert('Failed to delete HA device: ' + (error.error || 'Unknown error'));
      }
    } catch (e) {
      console.error('Failed to delete HA device:', e);
      alert('Failed to delete HA device');
    }
  }

  async _testHADevice(deviceId) {
    const device = this._haDevices.find(d => d.device_id === deviceId);
    if (!device) return;

    try {
      // Send a test command (home button for most devices)
      await this._hass.callService('vda_ir_control', 'send_ha_command', {
        device_id: deviceId,
        command: 'home',
      });
      alert('Test command sent successfully!');
    } catch (e) {
      console.error('Failed to test HA device:', e);
      alert('Failed to test HA device: ' + e.message);
    }
  }

  async _updateHAMatrixPortOptions(matrixDeviceId) {
    const portSelect = this.shadowRoot.getElementById('ha-matrix-port');
    if (!portSelect) return;

    portSelect.innerHTML = '<option value="">Select Input...</option>';

    if (!matrixDeviceId) return;

    try {
      const resp = await fetch(`/api/vda_ir_control/serial_devices/${matrixDeviceId}`, {
        headers: {
          'Authorization': `Bearer ${this._hass.auth.data.access_token}`,
        },
      });

      if (resp.ok) {
        const matrixDevice = await resp.json();
        const inputs = matrixDevice.matrix_inputs || [];

        inputs.forEach(input => {
          const option = document.createElement('option');
          option.value = input.index;
          option.textContent = input.name || `Input ${input.index}`;
          portSelect.appendChild(option);
        });
      }
    } catch (e) {
      console.error('Failed to load matrix ports:', e);
    }
  }

  getCardSize() {
    return 6;
  }
}

customElements.define('vda-ir-control-card', VDAIRControlCard);

// Register with Home Assistant
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'vda-ir-control-card',
  name: 'VDA IR Control',
  description: 'Management card for VDA IR Control system',
});
