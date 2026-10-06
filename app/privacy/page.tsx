export const metadata = { title: "Privacy Policy · Whirling Disc" };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-6">
      <h1 className="text-2xl font-bold">Privacy Policy</h1>
      <p className="mt-1 text-xs opacity-70">Effective October 6, 2026</p>

      <p className="mt-6">Whirling Disc helps you catalog, value, and protect your vinyl collection. This policy explains what we collect, why, and the choices you have. It is written in plain English on purpose.</p>

      <h2 className="mt-8 text-lg font-semibold">What we collect</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li><strong>Account details:</strong> your email address and password (stored hashed). If you sign in with Apple, we receive the identifier Apple provides and, if you share it, your email.</li>
        <li><strong>Your collection:</strong> the records you add, including artist, title, label, catalog numbers, condition, notes, and photos you upload.</li>
        <li><strong>Photos you submit for identification:</strong> when you photograph a cover or label, the image is sent to an AI service to identify the record. Images are used for that purpose only.</li>
        <li><strong>Usage information:</strong> basic logs needed to run and secure the service, such as sign-in time and errors.</li>
      </ul>
      <p className="mt-3">We do not collect your contacts, precise location, or health data, and we do not use advertising trackers.</p>

      <h2 className="mt-8 text-lg font-semibold">How we use it</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>To run your account and show you your collection.</li>
        <li>To identify records from photos and estimate values.</li>
        <li>To send account emails such as sign-in links and password resets.</li>
        <li>To keep the service secure and fix problems.</li>
      </ul>
      <p className="mt-3">We do not sell your personal information, and we do not share it for advertising.</p>

      <h2 className="mt-8 text-lg font-semibold">Services that help us run Whirling Disc</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li><strong>Supabase</strong> hosts the database, file storage, and sign-in.</li>
        <li><strong>Vercel</strong> hosts the app.</li>
        <li><strong>Anthropic</strong> provides the AI model that identifies records from the photos you submit.</li>
        <li><strong>Discogs</strong> supplies marketplace pricing used to estimate values.</li>
        <li><strong>Resend</strong> delivers account emails.</li>
      </ul>
      <p className="mt-3">Each provider receives only what it needs to do its job, and each is bound by its own privacy terms.</p>

      <h2 className="mt-8 text-lg font-semibold">Your choices</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li><strong>Edit or export:</strong> you can edit any record and export your collection from the app.</li>
        <li><strong>Delete your account:</strong> you can delete your account and all of your records from Account settings, or by emailing us. Deletion is permanent and completes within 30 days.</li>
        <li><strong>Camera and photos:</strong> the app asks for permission before using your camera or photo library, and only to add records.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Sharing a collection</h2>
      <p className="mt-2">If you create a share link or invite someone to a collection, the people you share with can see the records in that collection. You can revoke a share or invite at any time.</p>

      <h2 className="mt-8 text-lg font-semibold">Children</h2>
      <p className="mt-2">Whirling Disc is not directed to children under 13, and we do not knowingly collect information from them.</p>

      <h2 className="mt-8 text-lg font-semibold">Changes</h2>
      <p className="mt-2">If this policy changes in a meaningful way, we will post the new version here with a new effective date.</p>

      <h2 className="mt-8 text-lg font-semibold">Contact</h2>
      <p className="mt-2">Questions or deletion requests: <a className="underline" href="mailto:frank.sherfey@gmail.com">frank.sherfey@gmail.com</a>. Whirling Disc is made by Frank Sherfey in Sacramento, California.</p>
    </main>
  );
}
