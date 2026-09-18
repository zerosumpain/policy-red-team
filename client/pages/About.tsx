export function About() {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-xl">About this tool</h1>
        <p className="govuk-body-l">
          It reads a policy paper as an adversary would, across eighteen stages, and tells you
          who gains from it failing and what they can do about it while staying compliant.
        </p>
        <p className="govuk-body">
          It is not an assurance review. It will not tell you a policy is fine, and it is not
          designed to: a clean report means it found nothing, which is not the same thing.
          Every profile it writes is a hypothesis about a body's incentives, never a finding
          about a named person.
        </p>
        <h2 className="govuk-heading-l">What it runs on</h2>
        <p className="govuk-body">
          Everything is local. The database is embedded in the application, the papers you
          upload never leave your machine except as prompts to the model you configure, and a
          sealed assessment writes none of the paper in the clear.
        </p>
        <p className="govuk-body">
          It is not a government service, and it is not connected with any government
          department. It is styled with the GOV.UK Design System because the design system is
          good at documents and forms, which is what this is.
        </p>
      </div>
    </div>
  );
}
