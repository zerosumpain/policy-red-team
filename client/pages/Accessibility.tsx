import { SERVICE_NAME } from '../layout/Template';

/**
 * The accessibility statement.
 *
 * Required of a GOV.UK-styled service, and the honest place to name the two
 * deliberate deviations: the typeface, and the one component that cannot be made
 * to work for everyone in the same way.
 *
 * Written after local-plan-navigator's, which makes the same declarations for the
 * same reasons.
 */
export function Accessibility() {
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-xl">Accessibility statement</h1>

        <p className="govuk-body-l">
          This statement applies to {SERVICE_NAME}, a personal tool that runs on your own
          machine. It is not a government service and has no connection with any government
          department.
        </p>

        <h2 className="govuk-heading-l">How accessible this tool is</h2>
        <p className="govuk-body">
          It is built with the GOV.UK Design System and aims to meet{' '}
          <a className="govuk-link" href="https://www.w3.org/TR/WCAG22/" rel="external">
            WCAG 2.2 level AA
          </a>. Every page is checked automatically with axe-core on each build, and a build
          fails on any serious or critical issue.
        </p>
        <p className="govuk-body">An automated check is a floor, not a ceiling. It finds perhaps a third of what a person would.</p>

        <h2 className="govuk-heading-l">Deliberate differences from GOV.UK</h2>

        <h3 className="govuk-heading-m">The typeface</h3>
        <p className="govuk-body">
          The GDS Transport typeface is not used: it is licensed only to services on GOV.UK.
          This tool falls back to Helvetica Neue and Arial, the stack GOV.UK itself specifies
          off GOV.UK, so line lengths differ slightly from a real government service. The
          GOV.UK crown and the royal arms are not used either, and for the same reason.
        </p>

        <h3 className="govuk-heading-m">Hovering was replaced with clicking</h3>
        <p className="govuk-body">
          The version of this tool that runs on a website reveals detail when you hover a
          figure with a pointer. Content that appears on hover and cannot be reached from a
          keyboard is not available to everyone, so here every one of those is something you
          open — and it stays open until you close it.
        </p>

        <h3 className="govuk-heading-m">Diagrams have a table</h3>
        <p className="govuk-body">
          The relationship map and the exposure plot are pictures of data. Each is paired with
          the same data as a table, which is the version that works with a screen reader,
          survives being printed, and can be copied. Neither view is the "accessible
          alternative" to the other; they are two ways of reading one thing.
        </p>

        <h2 className="govuk-heading-l">Known problems</h2>
        <p className="govuk-body">
          Wide tables scroll sideways inside their own box. The box can be reached and scrolled
          from a keyboard, but on a narrow screen a table of eight columns is hard work however
          it is presented.
        </p>

        <h2 className="govuk-heading-l">Telling someone</h2>
        <p className="govuk-body">
          This tool has no support desk. If something here is unusable, the repository's issue
          tracker is the place to say so, and a report that names the page and what you were
          using is worth ten that do not.
        </p>
      </div>
    </div>
  );
}
