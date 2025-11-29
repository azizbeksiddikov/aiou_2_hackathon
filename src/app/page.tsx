import BleScanner from "@/components/BleScanner";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-pink-50 to-purple-50 dark:from-gray-900 dark:via-blue-950 dark:to-purple-950 py-8 sm:py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            <span className="bg-gradient-to-r from-blue-600 to-pink-600 bg-clip-text text-transparent">
              Piggybank
            </span>
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Connect & manage your savings
          </p>
        </div>
        <BleScanner />
      </div>
    </div>
  );
}
