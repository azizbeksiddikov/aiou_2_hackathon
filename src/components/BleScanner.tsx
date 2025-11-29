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

  const scanForDevices = async () => {
    if (!navigator.bluetooth) {
      setError("Web Bluetooth API is not available");
      return;
    }

    setIsScanning(true);
    setError(null);
    setDevices([]);

    try {
      // Request a Bluetooth device with no specific filters to see all available devices
      // Note: In practice, you might want to add specific service filters
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ["battery_service", "device_information"], // Add more services as needed
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

  const connectToDevice = async (bleDevice: BleDevice) => {
    setConnectionStatus("connecting");
    setError(null);
    setSelectedDevice(bleDevice);

    try {
      const server = await bleDevice.device.gatt?.connect();

      if (server && server.connected) {
        setConnectionStatus("connected");

        // Set up disconnect handler
        bleDevice.device.addEventListener("gattserverdisconnected", () => {
          setConnectionStatus("disconnected");
          setError("Device disconnected");
        });

        // Optional: Get device information or services
        try {
          const services = await server.getPrimaryServices();
          console.log("Available services:", services);
        } catch (err) {
          console.log("Could not retrieve services:", err);
        }
      } else {
        setConnectionStatus("failed");
        setError("Failed to establish GATT connection");
      }
    } catch (err) {
      setConnectionStatus("failed");
      if (err instanceof Error) {
        setError(`Connection failed: ${err.message}`);
      } else {
        setError("Failed to connect to device");
      }
    }
  };

  const disconnectFromDevice = () => {
    if (selectedDevice?.device?.gatt?.connected) {
      selectedDevice.device.gatt.disconnect();
      setConnectionStatus("disconnected");
      setSelectedDevice(null);
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
          <CardTitle>Bluetooth LE Device Scanner</CardTitle>
          <CardDescription>
            Scan for nearby Bluetooth Low Energy devices and connect to them
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
              "Scan for Devices"
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
              <p>
                No devices found. Click &quot;Scan for Devices&quot; to start
                searching.
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

          <div>
            <p className="font-medium text-foreground mb-2">Current URL:</p>
            <code className="text-xs bg-muted px-2 py-1 rounded">
              {typeof window !== "undefined"
                ? window.location.href
                : "Loading..."}
            </code>
            <p className="mt-1 text-xs">
              {typeof window !== "undefined" &&
              window.location.protocol === "https:"
                ? "✅ HTTPS - Bluetooth should work"
                : typeof window !== "undefined" &&
                  window.location.hostname === "localhost"
                ? "✅ Localhost - Bluetooth should work"
                : "⚠️ Not HTTPS - Bluetooth may not work"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
