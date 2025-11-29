"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [selectedCharacteristic, setSelectedCharacteristic] =
    useState<BluetoothRemoteGATTCharacteristic | null>(null);

  // Check if component is mounted (client-side)
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Check if Web Bluetooth is supported
  useEffect(() => {
    if (typeof navigator !== "undefined" && !navigator.bluetooth) {
      setIsSupported(false);
      setError(
        "Web Bluetooth API is not supported in this browser. Please use Chrome, Edge, or Opera."
      );
    }
  }, []);

  // Automatically scan for devices when component loads
  useEffect(() => {
    if (isSupported && devices.length === 0) {
      scanForDevices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported]);

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
      setError("Web Bluetooth API is not available");
      return;
    }

    setIsScanning(true);
    setError(null);
    setDevices([]);

    try {
      // Filter for devices starting with "piggybank"
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
        const bleDevice: BleDevice = {
          id: device.id,
          name: device.name || "Unknown Device",
          device: device,
        };

        setDevices((prev) => {
          // Avoid duplicates
          if (prev.some((d) => d.id === bleDevice.id)) {
            return prev;
          }
          return [...prev, bleDevice];
        });
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === "NotFoundError") {
          setError("No device selected. Please try scanning again.");
        } else if (err.name === "SecurityError") {
          setError(
            "Bluetooth access denied. Please check: (1) Bluetooth is enabled on your device, (2) You're on HTTPS or localhost, (3) Reset site permissions by clicking the lock icon in the address bar → Site settings → Bluetooth → Ask (default)."
          );
        } else {
          setError(`Error scanning for devices: ${err.message}`);
        }
      } else {
        setError("An unknown error occurred while scanning");
      }
    } finally {
      setIsScanning(false);
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
    setIsLoadingInfo(true);

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
        const info = await getDeviceInformation(server);
        setDeviceInfo(info);
        setIsLoadingInfo(false);

        console.log("Device connected:", {
          name: bleDevice.name,
          id: bleDevice.id,
          info,
        });
      } else {
        setConnectionStatus("failed");
        setError("Failed to establish GATT connection");
        setIsLoadingInfo(false);
        // Disconnect on failure
        if (bleDevice.device.gatt?.connected) {
          bleDevice.device.gatt.disconnect();
        }
      }
    } catch (err) {
      setConnectionStatus("failed");
      setIsLoadingInfo(false);

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

  const disconnectFromDevice = () => {
    if (selectedDevice?.device?.gatt?.connected) {
      console.log("Manually disconnecting device:", selectedDevice.name);
      selectedDevice.device.gatt.disconnect();
      setConnectionStatus("disconnected");
      setSelectedDevice(null);
      setDeviceInfo(null);
      setError(null);
      setSendStatus(null);
    }
  };

  const sendDataToDevice = async (value: string) => {
    if (!selectedCharacteristic) {
      setSendStatus("❌ No characteristic selected");
      setTimeout(() => setSendStatus(null), 3000);
      return;
    }

    setIsSending(true);
    setSendStatus(null);

    try {
      // Convert string to Uint8Array
      const encoder = new TextEncoder();
      const data = encoder.encode(value);

      console.log(
        `Attempting to send "${value}" (${data.length} bytes) to characteristic ${selectedCharacteristic.uuid}`
      );

      // Write to the characteristic
      await selectedCharacteristic.writeValue(data);
      console.log(`Successfully sent "${value}" to device`);

      setSendStatus(`✅ Sent: ${value}`);

      // Clear status after 3 seconds
      setTimeout(() => setSendStatus(null), 3000);
    } catch (err) {
      console.error("Error sending data:", err);
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
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-destructive">
            Bluetooth Not Supported
          </CardTitle>
          <CardDescription>
            Your browser doesn&apos;t support the Web Bluetooth API. Please use
            Chrome, Edge, or Opera on a device with Bluetooth support.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Scanner Card */}
      <Card>
        <CardHeader>
          <CardTitle>Piggybank Device Scanner</CardTitle>
          <CardDescription>
            Scan for nearby Piggybank Bluetooth devices and connect to them
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={scanForDevices}
            disabled={isScanning}
            className="w-full"
          >
            {isScanning ? (
              <>
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
                Scanning...
              </>
            ) : (
              "Scan for Piggybank Devices"
            )}
          </Button>

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Success Message */}
          {connectionStatus === "connected" && selectedDevice && (
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">
              Successfully connected to {selectedDevice.name}!
            </div>
          )}

          {/* Device Information Card */}
          {connectionStatus === "connected" && selectedDevice && (
            <Card className="border-green-200 dark:border-green-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                  Device Information
                </CardTitle>
                <CardDescription>
                  Detailed information about {selectedDevice.name}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingInfo ? (
                  <div className="flex items-center justify-center py-8">
                    <svg
                      className="animate-spin h-8 w-8 text-muted-foreground"
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
                  </div>
                ) : deviceInfo ? (
                  <div className="space-y-3 text-sm">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-muted-foreground text-xs">
                          Device Name
                        </p>
                        <p className="font-medium">{selectedDevice.name}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">
                          Device ID
                        </p>
                        <p className="font-mono text-xs truncate">
                          {selectedDevice.id}
                        </p>
                      </div>
                    </div>

                    {/* Battery Level */}
                    {deviceInfo.batteryLevel !== undefined && (
                      <div>
                        <p className="text-muted-foreground text-xs mb-1">
                          Battery Level
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                deviceInfo.batteryLevel > 50
                                  ? "bg-green-500"
                                  : deviceInfo.batteryLevel > 20
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                              }`}
                              style={{ width: `${deviceInfo.batteryLevel}%` }}
                            ></div>
                          </div>
                          <span className="font-medium">
                            {deviceInfo.batteryLevel}%
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Device Details */}
                    {(deviceInfo.manufacturer ||
                      deviceInfo.modelNumber ||
                      deviceInfo.serialNumber ||
                      deviceInfo.hardwareRevision ||
                      deviceInfo.firmwareRevision ||
                      deviceInfo.softwareRevision) && (
                      <div className="space-y-2 pt-2 border-t">
                        <p className="font-medium text-xs">Device Details</p>
                        <div className="grid gap-2">
                          {deviceInfo.manufacturer && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Manufacturer:
                              </span>
                              <span className="font-medium">
                                {deviceInfo.manufacturer}
                              </span>
                            </div>
                          )}
                          {deviceInfo.modelNumber && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Model:
                              </span>
                              <span className="font-medium">
                                {deviceInfo.modelNumber}
                              </span>
                            </div>
                          )}
                          {deviceInfo.serialNumber && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Serial Number:
                              </span>
                              <span className="font-mono text-xs">
                                {deviceInfo.serialNumber}
                              </span>
                            </div>
                          )}
                          {deviceInfo.hardwareRevision && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Hardware:
                              </span>
                              <span className="font-medium">
                                {deviceInfo.hardwareRevision}
                              </span>
                            </div>
                          )}
                          {deviceInfo.firmwareRevision && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Firmware:
                              </span>
                              <span className="font-medium">
                                {deviceInfo.firmwareRevision}
                              </span>
                            </div>
                          )}
                          {deviceInfo.softwareRevision && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Software:
                              </span>
                              <span className="font-medium">
                                {deviceInfo.softwareRevision}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Services */}
                    <div className="pt-2 border-t">
                      <p className="font-medium text-xs mb-2">
                        Available Services ({deviceInfo.services.length})
                      </p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {deviceInfo.services.map((service, index) => (
                          <div
                            key={index}
                            className="text-xs font-mono bg-muted px-2 py-1 rounded"
                          >
                            {service}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No additional information available
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Send Data Card */}
          {connectionStatus === "connected" && selectedDevice && deviceInfo && (
            <Card className="border-blue-200 dark:border-blue-800">
              <CardHeader>
                <CardTitle className="text-base">Send Data</CardTitle>
                <CardDescription>
                  Send commands to {selectedDevice.name}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {deviceInfo.allCharacteristics.length > 0 ? (
                  <>
                    <div>
                      <label className="text-xs font-medium mb-2 block">
                        Select Characteristic (
                        {deviceInfo.allCharacteristics.length} available)
                      </label>
                      <select
                        className="w-full p-2 text-xs border rounded bg-background"
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
                        {deviceInfo.allCharacteristics.map((char) => (
                          <option key={char.uuid} value={char.uuid}>
                            {char.uuid.slice(0, 8)}... (
                            {char.properties.write && "W"}
                            {char.properties.writeWithoutResponse && "Wr"}
                            {char.properties.read && "R"}
                            {char.properties.notify && "N"})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedCharacteristic && (
                      <>
                        <div className="flex gap-3">
                          <Button
                            onClick={() => sendDataToDevice("1")}
                            disabled={isSending}
                            variant="default"
                            className="flex-1"
                            size="lg"
                          >
                            {isSending ? (
                              <svg
                                className="animate-spin h-4 w-4"
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
                                <span className="text-2xl font-bold">1</span>
                                <span className="ml-2">Send 1</span>
                              </>
                            )}
                          </Button>
                          <Button
                            onClick={() => sendDataToDevice("0")}
                            disabled={isSending}
                            variant="outline"
                            className="flex-1"
                            size="lg"
                          >
                            {isSending ? (
                              <svg
                                className="animate-spin h-4 w-4"
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
                                <span className="text-2xl font-bold">0</span>
                                <span className="ml-2">Send 0</span>
                              </>
                            )}
                          </Button>
                        </div>

                        {sendStatus && (
                          <div
                            className={`p-3 rounded-lg text-sm font-medium text-center ${
                              sendStatus.startsWith("✅")
                                ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
                                : "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
                            }`}
                          >
                            {sendStatus}
                          </div>
                        )}

                        <div className="text-xs text-muted-foreground space-y-1">
                          <p>📡 Selected Characteristic:</p>
                          <code className="text-xs bg-muted px-2 py-1 rounded block break-all">
                            {selectedCharacteristic.uuid}
                          </code>
                          <p className="text-xs pt-1">
                            Properties:
                            {deviceInfo.allCharacteristics.find(
                              (c) => c.uuid === selectedCharacteristic.uuid
                            )?.properties.write && " Write"}
                            {deviceInfo.allCharacteristics.find(
                              (c) => c.uuid === selectedCharacteristic.uuid
                            )?.properties.writeWithoutResponse &&
                              " WriteWithoutResponse"}
                            {deviceInfo.allCharacteristics.find(
                              (c) => c.uuid === selectedCharacteristic.uuid
                            )?.properties.read && " Read"}
                            {deviceInfo.allCharacteristics.find(
                              (c) => c.uuid === selectedCharacteristic.uuid
                            )?.properties.notify && " Notify"}
                          </p>
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
              </CardContent>
            </Card>
          )}

          {/* Devices List */}
          {devices.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Available Devices ({devices.length})
              </h3>
              <div className="space-y-2">
                {devices.map((device) => (
                  <div
                    key={device.id}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {device.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        ID: {device.id}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {selectedDevice?.id === device.id &&
                      connectionStatus === "connected" ? (
                        <>
                          <span className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                            Connected
                          </span>
                          <Button
                            onClick={disconnectFromDevice}
                            size="sm"
                            variant="outline"
                          >
                            Disconnect
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={() => connectToDevice(device)}
                          disabled={connectionStatus === "connecting"}
                          size="sm"
                        >
                          {selectedDevice?.id === device.id &&
                          connectionStatus === "connecting" ? (
                            <>
                              <svg
                                className="animate-spin -ml-1 mr-2 h-3 w-3"
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
                            </>
                          ) : (
                            "Connect"
                          )}
                        </Button>
                      )}
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
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Requirements & Troubleshooting
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-4">
          <div>
            <p className="font-medium text-foreground mb-2">Requirements:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Bluetooth must be enabled on your device</li>
              <li>This page must be served over HTTPS (or localhost)</li>
              <li>Your browser must support Web Bluetooth API</li>
              <li>You must grant Bluetooth permission when prompted</li>
              <li>
                Device name must start with &quot;piggybank&quot; (e.g.,
                piggybank1, piggybank2)
              </li>
            </ul>
          </div>

          <div>
            <p className="font-medium text-foreground mb-2">
              If you see &quot;Bluetooth access denied&quot;:
            </p>
            <ol className="list-decimal list-inside space-y-1">
              <li>
                Click the lock/info icon in your browser&apos;s address bar
              </li>
              <li>
                Go to &quot;Site settings&quot; or &quot;Permissions&quot;
              </li>
              <li>
                Find &quot;Bluetooth&quot; and set it to &quot;Ask
                (default)&quot;
              </li>
              <li>Reload the page and try scanning again</li>
            </ol>
          </div>

          {isMounted && (
            <div>
              <p className="font-medium text-foreground mb-2">Current URL:</p>
              <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                {window.location.href}
              </code>
              <p className="mt-1 text-xs">
                {window.location.protocol === "https:"
                  ? "✅ HTTPS - Bluetooth should work"
                  : window.location.hostname === "localhost"
                  ? "✅ Localhost - Bluetooth should work"
                  : "⚠️ Not HTTPS - Bluetooth may not work"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
