import BleScanner from "@/components/BleScanner";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            Bluetooth LE Scanner
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Discover and connect to nearby Bluetooth Low Energy devices
          </p>
        </div>
        <BleScanner />
      </div>
    </div>
  );
}
