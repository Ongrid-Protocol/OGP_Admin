"use client";

// import Image from "next/image"; // No longer needed
// import { MockUsdcAdmin } from "@/components/mocktoken/MockUsdcAdmin"; // No longer needed here

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center flex-grow p-8 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-[16px] items-center text-center">
        {/* <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={180}
          height={38}
          priority
        /> */}
        <div className="my-4 w-full max-w-2xl">
          <h1 className="text-4xl font-bold mb-4">Welcome to OnGrid Admin</h1>
          <p className="text-xl text-gray-700">Select a contract category from the navbar to begin.</p>
        </div>
      </main>
    </div>
  );
}
