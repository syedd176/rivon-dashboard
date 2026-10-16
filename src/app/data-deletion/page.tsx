export const metadata = {
  title: "Data Deletion · Rivon",
  description: "How to have your data deleted from Rivon.",
};

/**
 * Data deletion instructions.
 *
 * Meta requires a URL for this on every app that handles user data. It also
 * covers part of the data subject rights obligation in SYSTEM_DESIGN.md §17.7.
 *
 * Currently a documented manual process, which is honest for a product with
 * no tenants. It becomes an endpoint when the backend exists.
 */

export default function DataDeletionPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="font-serif text-3xl font-bold text-slate-900 dark:text-slate-50">
        Deleting your data
      </h1>
      <p className="mt-3 text-slate-700 dark:text-slate-300">
        You can ask us to delete your data at any time, and we will do it.
      </p>

      <section className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100">
          If you are a business using Rivon
        </h2>
        <p className="mt-2 text-slate-700 dark:text-slate-300">
          Email{" "}
          <a
            href="mailto:syedkarawan@gmail.com?subject=Data%20deletion%20request"
            className="font-medium text-sky-700 underline dark:text-sky-400"
          >
            syedkarawan@gmail.com
          </a>{" "}
          from the address on your account, with the subject{" "}
          <strong>Data deletion request</strong>.
        </p>
        <p className="mt-3 text-slate-700 dark:text-slate-300">
          We will confirm within <strong>7 days</strong> and complete the
          deletion within <strong>30 days</strong>. This removes your account,
          your configuration, and all conversations held on your behalf.
        </p>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/50">
        <h2 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100">
          If you messaged a business that uses Rivon
        </h2>
        <p className="mt-2 text-slate-700 dark:text-slate-300">
          Your conversation belongs to that business, not to us — we hold it on
          their behalf. Contact them first and ask them to delete it.
        </p>
        <p className="mt-3 text-slate-700 dark:text-slate-300">
          If you cannot reach them, email us at the address above with the
          business name and the phone number you messaged from, and we will help.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100">
          What gets deleted
        </h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-700 dark:text-slate-300">
          <li>Account and contact details</li>
          <li>Connected messaging accounts and their access tokens</li>
          <li>Service and pricing configuration</li>
          <li>Conversation history and anything extracted from it</li>
        </ul>
        <p className="mt-3 text-slate-700 dark:text-slate-300">
          Technical logs are kept for up to 90 days and then removed
          automatically. Where we are required by law to retain something, we
          will say so when we confirm your request.
        </p>
      </section>

      <p className="mt-10 border-t border-slate-200 pt-5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        See also our{" "}
        <a href="/privacy" className="text-sky-700 underline dark:text-sky-400">
          privacy policy
        </a>
        .
      </p>
    </main>
  );
}
