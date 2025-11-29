"use client";

import { useState, useEffect } from "react";

interface BleDevice {
  id: string;
  name: string;
  device: BluetoothDevice;
}

interface CharacteristicInfo {
  uuid: string;
  serviceUuid: string;
  properties: {
    read: boolean;
    write: boolean;
    writeWithoutResponse: boolean;
    notify: boolean;
  };
  characteristic: BluetoothRemoteGATTCharacteristic;
}

interface DeviceInfo {
  services: string[];
  batteryLevel?: number;
  rssi?: number;
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  hardwareRevision?: string;
  firmwareRevision?: string;
  softwareRevision?: string;
  allCharacteristics: CharacteristicInfo[];
}

type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "failed"
  | "disconnected";

export default function BleScanner() {
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<BleDevice | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [isSupported, setIsSupported] = useState(true);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [selectedCharacteristic, setSelectedCharacteristic] =
    useState<BluetoothRemoteGATTCharacteristic | null>(null);

  // Check if Web Bluetooth is supported
  useEffect(() => {
    if (typeof navigator !== "undefined" && !navigator.bluetooth) {
      setIsSupported(false);
      setError(
        "Web Bluetooth API is not supported in this browser. Please use Chrome, Edge, or Opera."
      );
    }
  }, []);

  // Cleanup: Disconnect device on component unmount or page close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (selectedDevice?.device?.gatt?.connected) {
        selectedDevice.device.gatt.disconnect();
      }
    };

    // Add event listener for page close/refresh
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Cleanup function for component unmount
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (selectedDevice?.device?.gatt?.connected) {
        console.log("Disconnecting device on component unmount...");
        selectedDevice.device.gatt.disconnect();
      }
    };
  }, [selectedDevice]);

  const scanForDevices = async () => {
    if (!navigator.bluetooth) {
      console.error("❌ Web Bluetooth API is not available");
      setError("Web Bluetooth API is not available");
      return;
    }

    console.log("🔍 Starting device scan...");
    setIsScanning(true);
    setError(null);
    setDevices([]);

    try {
      console.log("📡 Requesting Bluetooth device with filters: piggybank*");
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "piggybank" }],
        optionalServices: [
          "battery_service",
          "device_information",
          "generic_access",
          "generic_attribute",
          // Nordic UART Service (common for custom devices)
          "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
        ],
      });

      if (device) {
        console.log("✅ Device found:", {
          name: device.name,
          id: device.id,
        });

        const bleDevice: BleDevice = {
          id: device.id,
          name: device.name || "Unknown Device",
          device: device,
        };

        setDevices((prev) => {
          // Avoid duplicates
          if (prev.some((d) => d.id === bleDevice.id)) {
            console.log("ℹ️ Device already in list");
            return prev;
          }
          console.log("➕ Adding device to list");
          return [...prev, bleDevice];
        });
      }
    } catch (err) {
      if (err instanceof Error) {
        console.error("❌ Scan error:", err.name, err.message);
        if (err.name === "NotFoundError") {
          setError("No device selected. Please try scanning again.");
        } else if (err.name === "SecurityError") {
          setError(
            "Bluetooth access denied. Enable Bluetooth and grant permission in browser settings."
          );
        } else {
          setError(`Error scanning for devices: ${err.message}`);
        }
      } else {
        console.error("❌ Unknown scan error:", err);
        setError("An unknown error occurred while scanning");
      }
    } finally {
      setIsScanning(false);
      console.log("🔍 Scan completed");
    }
  };

  const readCharacteristic = async (
    service: BluetoothRemoteGATTService,
    characteristicUuid: string
  ): Promise<string | null> => {
    try {
      const characteristic = await service.getCharacteristic(
        characteristicUuid
      );
      const value = await characteristic.readValue();
      const decoder = new TextDecoder("utf-8");
      return decoder.decode(value);
    } catch {
      return null;
    }
  };

  const getAllCharacteristics = async (
    server: BluetoothRemoteGATTServer
  ): Promise<CharacteristicInfo[]> => {
    const allChars: CharacteristicInfo[] = [];

    try {
      const services = await server.getPrimaryServices();
      console.log(`Found ${services.length} services`);

      for (const service of services) {
        try {
          const characteristics = await service.getCharacteristics();
          console.log(
            `Service ${service.uuid} has ${characteristics.length} characteristics`
          );

          for (const characteristic of characteristics) {
            const info: CharacteristicInfo = {
              uuid: characteristic.uuid,
              serviceUuid: service.uuid,
              properties: {
                read: characteristic.properties.read,
                write: characteristic.properties.write,
                writeWithoutResponse:
                  characteristic.properties.writeWithoutResponse,
                notify: characteristic.properties.notify,
              },
              characteristic: characteristic,
            };

            allChars.push(info);

            console.log(`Characteristic ${characteristic.uuid}:`, {
              read: characteristic.properties.read,
              write: characteristic.properties.write,
              writeWithoutResponse:
                characteristic.properties.writeWithoutResponse,
              notify: characteristic.properties.notify,
            });
          }
        } catch (err) {
          console.log(
            "Could not get characteristics for service:",
            service.uuid,
            err
          );
        }
      }
    } catch (err) {
      console.error("Error getting characteristics:", err);
    }

    return allChars;
  };

  const getDeviceInformation = async (
    server: BluetoothRemoteGATTServer
  ): Promise<DeviceInfo> => {
    const info: DeviceInfo = {
      services: [],
      allCharacteristics: [],
    };

    try {
      // Get all available services
      const services = await server.getPrimaryServices();
      info.services = services.map((s) => s.uuid);

      // Get all characteristics
      info.allCharacteristics = await getAllCharacteristics(server);

      // Auto-select first writable characteristic if any
      const writableChar = info.allCharacteristics.find(
        (c) => c.properties.write || c.properties.writeWithoutResponse
      );
      if (writableChar) {
        setSelectedCharacteristic(writableChar.characteristic);
      }

      // Try to get battery level
      try {
        const batteryService = await server.getPrimaryService(
          "battery_service"
        );
        const batteryLevel = await batteryService.getCharacteristic(
          "battery_level"
        );
        const value = await batteryLevel.readValue();
        info.batteryLevel = value.getUint8(0);
      } catch (err) {
        console.log("Battery service not available:", err);
      }

      // Try to get device information
      try {
        const deviceInfoService = await server.getPrimaryService(
          "device_information"
        );

        info.manufacturer =
          (await readCharacteristic(
            deviceInfoService,
            "manufacturer_name_string"
          )) || undefined;
        info.modelNumber =
          (await readCharacteristic(
            deviceInfoService,
            "model_number_string"
          )) || undefined;
        info.serialNumber =
          (await readCharacteristic(
            deviceInfoService,
            "serial_number_string"
          )) || undefined;
        info.hardwareRevision =
          (await readCharacteristic(
            deviceInfoService,
            "hardware_revision_string"
          )) || undefined;
        info.firmwareRevision =
          (await readCharacteristic(
            deviceInfoService,
            "firmware_revision_string"
          )) || undefined;
        info.softwareRevision =
          (await readCharacteristic(
            deviceInfoService,
            "software_revision_string"
          )) || undefined;
      } catch (err) {
        console.log("Device information service not available:", err);
      }
    } catch (err) {
      console.error("Error getting device information:", err);
      // If we can't get device info but are still connected, don't disconnect
    }

    return info;
  };

  const connectToDevice = async (bleDevice: BleDevice) => {
    setConnectionStatus("connecting");
    setError(null);
    setSelectedDevice(bleDevice);
    setDeviceInfo(null);

    try {
      const server = await bleDevice.device.gatt?.connect();

      if (server && server.connected) {
        setConnectionStatus("connected");

        // Set up disconnect handler
        const handleDisconnect = () => {
          console.log("Device disconnected");
          setConnectionStatus("disconnected");
          setError("Device disconnected. Click 'Connect' to reconnect.");
          setDeviceInfo(null);
          setSelectedDevice(null);
        };

        bleDevice.device.addEventListener(
          "gattserverdisconnected",
          handleDisconnect
        );

        // Get detailed device information
        console.log("📋 Getting device information...");
        const info = await getDeviceInformation(server);
        setDeviceInfo(info);

        console.log("✅ Device fully connected and ready:", {
          name: bleDevice.name,
          id: bleDevice.id,
          info,
        });
      } else {
        console.error("❌ GATT connection failed");
        setConnectionStatus("failed");
        setError("Failed to establish GATT connection");
        // Disconnect on failure
        if (bleDevice.device.gatt?.connected) {
          bleDevice.device.gatt.disconnect();
        }
      }
    } catch (err) {
      console.error("❌ Connection error:", err);
      setConnectionStatus("failed");

      // Attempt to disconnect on error
      if (bleDevice.device.gatt?.connected) {
        try {
          bleDevice.device.gatt.disconnect();
          console.log("Disconnected device after connection error");
        } catch (disconnectErr) {
          console.error("Failed to disconnect after error:", disconnectErr);
        }
      }

      if (err instanceof Error) {
        setError(`Connection failed: ${err.message}`);
      } else {
        setError("Failed to connect to device");
      }
    }
  };

  const sendDataToDevice = async (value: string) => {
    if (!selectedCharacteristic) {
      console.error("❌ No characteristic selected");
      setSendStatus("❌ No characteristic selected");
      setTimeout(() => setSendStatus(null), 3000);
      return;
    }

    console.log(`\n📤 ========== SENDING DATA ==========`);
    console.log(`📝 Value to send: "${value}"`);
    console.log(`🎯 Target characteristic: ${selectedCharacteristic.uuid}`);

    setIsSending(true);
    setSendStatus(null);

    try {
      // Convert string to Uint8Array
      const encoder = new TextEncoder();
      const data = encoder.encode(value);

      console.log(`💾 Encoded data:`, {
        string: value,
        bytes: Array.from(data),
        length: data.length,
      });

      console.log(`⏳ Writing to characteristic...`);
      await selectedCharacteristic.writeValue(data);

      console.log(`✅ Data sent successfully!`);
      console.log(`====================================\n`);

      setSendStatus(`✅ Sent: ${value}`);

      // Clear status after 3 seconds
      setTimeout(() => setSendStatus(null), 3000);
    } catch (err) {
      console.error("❌ Error sending data:", err);
      console.log(`====================================\n`);

      if (err instanceof Error) {
        setSendStatus(`❌ Error: ${err.message}`);
      } else {
        setSendStatus("❌ Failed to send data");
      }
      setTimeout(() => setSendStatus(null), 5000);
    } finally {
      setIsSending(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="w-full max-w-md mx-auto px-4">
        <div className="backdrop-blur-xl bg-red-500/10 border border-red-300/20 rounded-3xl p-6 shadow-2xl">
          <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">
            Bluetooth Not Supported
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Your browser doesn&apos;t support the Web Bluetooth API. Please use
            Chrome, Edge, or Opera on a device with Bluetooth support.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 space-y-6">
      {/* Scanner Card */}
      <div className="backdrop-blur-xl bg-white/40 dark:bg-gray-900/40 border border-white/20 dark:border-gray-700/20 rounded-3xl p-6 shadow-2xl">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-pink-600 bg-clip-text text-transparent mb-2">
          Piggybank Devices
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Connect to your piggybank device
        </p>

        <div className="space-y-4">
          <button
            onClick={scanForDevices}
            disabled={isScanning}
            className="w-full py-4 px-6 rounded-2xl font-semibold text-white bg-gradient-to-r from-blue-500 to-pink-500 hover:from-blue-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all duration-200 active:scale-95"
          >
            {isScanning ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Scanning...
              </span>
            ) : (
              "🔍 Scan for Devices"
            )}
          </button>

          {/* Error Message */}
          {error && (
            <div className="backdrop-blur-lg bg-red-500/10 border border-red-300/30 rounded-2xl p-4 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Success Message */}
          {connectionStatus === "connected" && selectedDevice && (
            <div className="backdrop-blur-lg bg-green-500/10 border border-green-300/30 rounded-2xl p-4 text-green-600 dark:text-green-400 text-sm font-medium">
              ✅ Connected to {selectedDevice.name}
            </div>
          )}

          {/* Action Buttons */}
          {connectionStatus === "connected" && selectedDevice && deviceInfo && (
            <div className="backdrop-blur-xl bg-white/40 dark:bg-gray-900/40 border border-white/20 dark:border-gray-700/20 rounded-3xl p-6 shadow-2xl transform-gpu will-change-auto">
              <div className="space-y-4">
                {deviceInfo.allCharacteristics.length > 0 ? (
                  <>
                    {/* Advanced Options - Collapsed by default */}
                    <details className="text-xs text-gray-500 dark:text-gray-400">
                      <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors mb-2">
                        ⚙️ Advanced: Select Characteristic
                      </summary>
                      <div className="mt-2 p-3 backdrop-blur-lg bg-white/30 dark:bg-gray-800/30 rounded-xl">
                        <label className="block font-medium mb-2 text-xs">
                          Writable Characteristics (
                          {
                            deviceInfo.allCharacteristics.filter(
                              (c) =>
                                c.properties.write ||
                                c.properties.writeWithoutResponse
                            ).length
                          }{" "}
                          available)
                        </label>
                        <select
                          className="w-full p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm"
                          value={selectedCharacteristic?.uuid || ""}
                          onChange={(e) => {
                            const char = deviceInfo.allCharacteristics.find(
                              (c) => c.uuid === e.target.value
                            );
                            setSelectedCharacteristic(
                              char?.characteristic || null
                            );
                          }}
                        >
                          {deviceInfo.allCharacteristics
                            .filter(
                              (char) =>
                                char.properties.write ||
                                char.properties.writeWithoutResponse
                            )
                            .map((char) => (
                              <option key={char.uuid} value={char.uuid}>
                                {char.uuid.slice(0, 8)}... (
                                {char.properties.write && "W"}
                                {char.properties.writeWithoutResponse && "Wr"}
                                {char.properties.read && "R"}
                                {char.properties.notify && "N"})
                              </option>
                            ))}
                        </select>
                        <p className="text-xs mt-2 text-gray-500">
                          Currently using:{" "}
                          {selectedCharacteristic?.uuid.slice(0, 13)}...
                        </p>
                      </div>
                    </details>

                    {selectedCharacteristic && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              sendDataToDevice("1");
                            }}
                            disabled={isSending}
                            className="group relative overflow-hidden py-8 px-6 rounded-2xl font-bold text-white bg-gradient-to-br from-blue-500 to-pink-500 hover:from-blue-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl transition-opacity duration-200 text-left transform-gpu backface-hidden"
                          >
                            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="relative z-10 min-h-[80px] flex flex-col justify-center">
                              {isSending ? (
                                <svg
                                  className="animate-spin h-6 w-6"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  ></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  ></path>
                                </svg>
                              ) : (
                                <>
                                  <div className="text-3xl mb-2">💰</div>
                                  <div className="text-sm">
                                    + 10&apos;000 KRW
                                  </div>
                                </>
                              )}
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              sendDataToDevice("0");
                            }}
                            disabled={isSending}
                            className="group relative overflow-hidden py-8 px-6 rounded-2xl font-bold text-white bg-gradient-to-br from-pink-500 to-blue-500 hover:from-pink-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl transition-opacity duration-200 text-left transform-gpu backface-hidden"
                          >
                            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="relative z-10 min-h-[80px] flex flex-col justify-center">
                              {isSending ? (
                                <svg
                                  className="animate-spin h-6 w-6"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  ></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  ></path>
                                </svg>
                              ) : (
                                <>
                                  <div className="text-3xl mb-2">💸</div>
                                  <div className="text-sm">Mom</div>
                                </>
                              )}
                            </div>
                          </button>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">
                      ⚠️ No characteristics found on this device
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Check the console for more details
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status Message - Separate at bottom */}
          {sendStatus && (
            <div
              className={`backdrop-blur-xl p-4 rounded-2xl text-sm font-semibold text-center shadow-lg ${
                sendStatus.startsWith("✅")
                  ? "bg-green-500/20 border border-green-300/30 text-green-600 dark:text-green-400"
                  : "bg-red-500/20 border border-red-300/30 text-red-600 dark:text-red-400"
              }`}
            >
              {sendStatus}
            </div>
          )}

          {/* Devices List */}
          {devices.length > 0 && connectionStatus !== "connected" && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Available Devices
              </h3>
              <div className="space-y-3">
                {devices.map((device) => (
                  <div
                    key={device.id}
                    className="backdrop-blur-lg bg-white/60 dark:bg-gray-800/60 border border-white/30 dark:border-gray-700/30 rounded-2xl p-4 shadow-lg"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-lg truncate text-gray-900 dark:text-white">
                          {device.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono mt-1">
                          {device.id}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => connectToDevice(device)}
                        disabled={connectionStatus === "connecting"}
                        className="px-6 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-500 to-pink-500 text-white hover:from-blue-600 hover:to-pink-600 disabled:opacity-50 transition-all active:scale-95 shadow-md"
                      >
                        {selectedDevice?.id === device.id &&
                        connectionStatus === "connecting" ? (
                          <span className="flex items-center">
                            <svg
                              className="animate-spin -ml-1 mr-2 h-4 w-4"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              ></circle>
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              ></path>
                            </svg>
                            Connecting...
                          </span>
                        ) : (
                          "Connect"
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Devices Message */}
          {!isScanning && devices.length === 0 && !error && (
            <div className="text-center p-8 text-muted-foreground">
              <svg
                className="mx-auto h-12 w-12 mb-4 opacity-50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <p className="mb-2">No piggybank devices found.</p>
              <p className="text-xs">
                Click &quot;Scan for Piggybank Devices&quot; to search for
                devices starting with &quot;piggybank&quot;
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
