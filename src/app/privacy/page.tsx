export const metadata = {
  title: "Privacy Policy · Rivon",
  description: "How Rivon handles personal data.",
};

/**
 * Privacy policy.
 *
 * Required by Meta App Review, and by UK/EU data protection law once real
 * tenants exist. Written to match the declarations made in the App Review
 * Data handling tab — controller, processors, location — so a reviewer
 * comparing the two finds them consistent.
 *
 * NOT legal advice. Before onboarding a paying customer this should be
 * reviewed by someone qualified, and updated when the AI layer, database
 * and storage go live.
 */

const UPDATED = "16 October 2026";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="font-serif text-xl font-bold text-slate-900 dark:text-slate-100">
        {title}
      </h2>
      <div className="mt-2 space-y-3 text-slate-700 dark:text-slate-300">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="font-serif text-3xl font-bold text-slate-900 dark:text-slate-50">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Last updated {UPDATED}
      </p>

      <Section title="Who we are">
        <p>
          Rivon is a customer messaging platform for small service businesses in
          the United Kingdom and Ireland, such as cleaning companies, pest
          control firms and removals. A business connects their own messaging
          accounts, and Rivon answers their customers&apos; enquiries on their
          behalf.
        </p>
        <p>
          The person responsible for data controlled by Rivon is{" "}
          <strong>Syed Ali Hussnain Jafari</strong>, located in Pakistan.
          Contact:{" "}
          <a
            href="mailto:syedkarawan@gmail.com"
            className="text-sky-700 underline dark:text-sky-400"
          >
            syedkarawan@gmail.com
          </a>
          .
        </p>
      </Section>

      <Section title="Two kinds of data, two different roles">
        <p>
          <strong>Business account data.</strong> Information about the
          businesses who use Rivon — name, email address, the messaging accounts
          they connect, and their service and pricing configuration. For this,
          Rivon is the data controller.
        </p>
        <p>
          <strong>Customer conversation data.</strong> Messages sent by a
          business&apos;s own customers, and the details extracted from them. For
          this, Rivon is a data processor acting on that business&apos;s
          instructions. The business is the controller of their customers&apos;
          data.
        </p>
      </Section>

      <Section title="What we collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Business contact details — name, email address, and the business
            name
          </li>
          <li>
            Messaging account identifiers supplied by Meta when a business
            connects WhatsApp, Instagram or Facebook — account IDs, phone number
            IDs, and access tokens
          </li>
          <li>
            Messages exchanged between a business and its customers through a
            connected channel, including the sender&apos;s phone number or
            profile name
          </li>
          <li>
            Service configuration entered by the business — services offered,
            prices, areas covered, availability
          </li>
          <li>
            Technical logs needed to operate the service — timestamps, error
            records, and delivery status
          </li>
        </ul>
        <p>
          We do not collect special category data, and we do not ask for payment
          card details.
        </p>
      </Section>

      <Section title="Why we use it">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>To receive and reply to messages on a business&apos;s behalf</li>
          <li>
            To work out what a customer is asking for, so the business can
            respond accurately
          </li>
          <li>
            To produce price quotations from the business&apos;s own rate card,
            which that business approves before anything is sent
          </li>
          <li>To show a business its own conversations and activity</li>
          <li>To keep the service working, and to diagnose faults</li>
        </ul>
        <p>
          We do not sell personal data. We do not use conversation content for
          advertising.
        </p>
      </Section>

      <Section title="Who else handles the data">
        <p>
          We use the following service providers, who process data on our
          instructions:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Vercel Inc.</strong> (United States) — hosts the application
            and serves every request
          </li>
          <li>
            <strong>Meta Platforms</strong> — delivers messages on WhatsApp,
            Instagram and Facebook Messenger, under their own terms
          </li>
        </ul>
        <p>
          This list will grow as the service develops, and this page will be
          updated when it does.
        </p>
      </Section>

      <Section title="Where data is held">
        <p>
          The application is hosted by Vercel, which operates infrastructure in
          several countries including the United States. The person responsible
          for Rivon is located in Pakistan, which does not have a UK or EU
          adequacy decision.
        </p>
        <p>
          Where personal data of people in the UK or EU is transferred outside
          those areas, we rely on appropriate safeguards, and we limit access to
          what is necessary to operate and support the service.
        </p>
      </Section>

      <Section title="How long we keep it">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Conversation records, for as long as the business uses Rivon, and up
            to 12 months afterwards
          </li>
          <li>
            Business account records, for as long as the account is open, and up
            to 12 months afterwards
          </li>
          <li>Technical logs, up to 90 days</li>
        </ul>
        <p>A business may ask us to delete their data sooner.</p>
      </Section>

      <Section title="Your rights">
        <p>
          If you are in the UK or the EU, you have the right to ask for a copy
          of your personal data, to have it corrected or deleted, to object to
          how it is used, and to ask that it is not subject to a decision made
          only by automated means.
        </p>
        <p>
          If you are a customer of a business that uses Rivon, please contact
          that business first — they control your data. If you cannot reach
          them, write to us and we will help.
        </p>
        <p>
          To make a request, email{" "}
          <a
            href="mailto:syedkarawan@gmail.com"
            className="text-sky-700 underline dark:text-sky-400"
          >
            syedkarawan@gmail.com
          </a>
          . We will respond within one month.
        </p>
        <p>
          If you are unhappy with our response, you may complain to the UK
          Information Commissioner&apos;s Office, or to the data protection
          authority in your country.
        </p>
      </Section>

      <Section title="Automated processing">
        <p>
          Rivon uses software to read incoming messages, work out what the
          customer is asking for, and draft a reply. Prices are calculated by
          fixed rules from the business&apos;s own rate card, never generated by
          a language model.
        </p>
        <p>
          A person at the business reviews and approves any price quotation
          before it is sent to a customer. Where the system cannot help, it says
          so and passes the conversation to a person rather than guessing.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          A business can ask us to delete their account and all associated
          conversation data by emailing{" "}
          <a
            href="mailto:syedkarawan@gmail.com"
            className="text-sky-700 underline dark:text-sky-400"
          >
            syedkarawan@gmail.com
          </a>{" "}
          from the address on the account. We will confirm within 7 days and
          complete deletion within 30 days.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We will update this page when the service changes, and the date at the
          top will change with it.
        </p>
      </Section>

      <p className="mt-10 border-t border-slate-200 pt-5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Rivon is a product in development. This policy describes current
        practice and will be revised as the service grows.
      </p>
    </main>
  );
}
