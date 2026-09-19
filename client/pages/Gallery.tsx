import { useState } from 'react';
import {
  Accordion, Button, ButtonGroup, Details, ErrorSummary, FileUpload, Input,
  InsetText, NotificationBanner, Panel, Radios, Select, SummaryList, Table,
  Tag, TaskList, Textarea, WarningText, type Task,
} from '../govuk';
import { usePageTitle } from '../layout/Template';
import { BarChart, Figure } from '../report/Figure';

/**
 * Every component, on one page, with the content it will actually carry.
 *
 * This is the phase 3 deliverable and the thing `npm run a11y` scans. Realistic
 * content matters more than it sounds: an accessibility check over lorem ipsum
 * passes happily and tells you nothing about a stage list with eighteen rows, a
 * playbook table wider than the page, or an error summary with three entries.
 *
 * It is also how a design decision gets argued before it is spread across ten
 * pages — which of these carries the report, and which of them the site version's
 * dark dashboard was reaching for without having a pattern to use.
 */

const STAGE_NAMES = [
  'Document ingestion', 'Document decomposition', 'Entity resolution', 'Policy knowledge graph',
  'Actor and incentive profiles', 'Targeted research', 'Evidence matrix', 'Interaction models',
  'Automated policy tests', 'Adversarial scenarios and sensitivity', 'Exploitation playbook',
  'Cross-policy exposure', 'Synthesis', 'Actor persona library', 'Theory of change',
  'Options and evaluation', 'Independent challenge', 'Assured synthesis',
];

/** The eighteen stages as a task list — the run page's spine. */
function stageTasks(): Task[] {
  return STAGE_NAMES.map((name, i) => {
    if (i < 11) return { title: name, status: { tag: { text: 'Completed', colour: 'green' as const } } };
    if (i === 11) return { title: name, hint: 'Comparing this paper against four earlier assessments.', status: { tag: { text: 'In progress', colour: 'blue' as const } } };
    // "With gaps", not "Completed with gaps". A status column is narrow by
    // design and GOV.UK's own statuses are two words; the longer phrase wrapped
    // onto two lines at every width, which reads as a problem with the row
    // rather than a description of it. The full meaning goes in the hint, where
    // there is room for it.
    if (i === 12) return { title: name, hint: 'Finished, but three sources could not be retrieved.', status: { tag: { text: 'With gaps', colour: 'yellow' as const } } };
    return { title: name, status: { text: 'Not started yet' } };
  });
}

export function Gallery() {
  usePageTitle('Design system');
  const [depth, setDepth] = useState('standard');
  const [showErrors, setShowErrors] = useState(false);

  return (
    <>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-xl">Design system</h1>
          <p className="govuk-body-l">
            Every component this service uses, carrying the content it will actually carry.
          </p>
          <p className="govuk-body">
            Nothing here is bespoke where GOV.UK has a pattern. Where it does not — a table
            wider than the page, a figure set beside a status — the service adds one rule and
            says why in <code className="govuk-body">client/styles/app.scss</code>.
          </p>
        </div>
      </div>

      <h2 className="govuk-heading-l govuk-!-margin-top-8">Progress</h2>
      <p className="govuk-body">
        The eighteen stages. A task list, because that is what this is: a sequence of things
        with a state, which a reader wants to scan rather than read.
      </p>
      <TaskList items={stageTasks()} idPrefix="stages" />

      <h2 className="govuk-heading-l govuk-!-margin-top-8">The report</h2>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <SummaryList
            rows={[
              { key: 'Paper', value: 'Draft Schools (Accountability) Bill 2026' },
              { key: 'Assessed', value: '18 September 2026' },
              { key: 'Stages', value: '18 of 18 completed' },
              { key: 'Bodies profiled', value: '14' },
              { key: 'Plays found', value: '31, of which 22 stay compliant' },
              { key: 'Evidence', value: '9 claims backed, 4 contradicted, 11 unsettled' },
            ]}
          />
        </div>
      </div>

      <h3 className="govuk-heading-m">Findings</h3>
      <Table
        caption="The exploitation playbook, ranked"
        captionSize="s"
        scroll
        columns={[
          { header: 'Play' }, { header: 'Body' }, { header: 'Incentive', numeric: true },
          { header: 'Ease', numeric: true }, { header: 'Impact', numeric: true },
          { header: 'Concealment', numeric: true }, { header: 'Rank', numeric: true }, { header: 'Compliant' },
        ]}
        rows={[
          ['Reclassify pupils before the census date', 'Multi-academy trusts', '0.82', '0.74', '0.66', '0.71', '0.73', <Tag colour="grey" key="a">Compliant</Tag>],
          ['Delay the return until after the funding cut-off', 'Local authorities', '0.77', '0.81', '0.52', '0.63', '0.67', <Tag colour="grey" key="b">Compliant</Tag>],
          ['Report attendance against the softer of two definitions', 'Schools', '0.69', '0.88', '0.44', '0.79', '0.68', <Tag colour="grey" key="c">Compliant</Tag>],
          ['Withhold the underlying data pending review', 'The department', '0.55', '0.62', '0.71', '0.48', '0.58', <Tag colour="red" key="d">Contested</Tag>],
        ]}
      />
      <p className="govuk-body-s prt-meta">
        Rank is the geometric mean of the four factors, computed on the server. A play that
        scores high on three and near zero on one is not a threat, and an average would hide that.
      </p>

      <h3 className="govuk-heading-m govuk-!-margin-top-6">Detail, on request</h3>
      <Details summary="How the four factors are judged">
        <p className="govuk-body">
          The model judges each factor on a scale from nothing to certain, and the server
          combines them. They are judgements about incentives, not findings about any named
          person, and the profile each one comes from records whether it was read off the paper
          or reasoned from it.
        </p>
      </Details>

      <Accordion
        id="report-sections"
        sections={[
          { heading: 'Who is involved', summary: '14 bodies, 3 unresolved', content: <p className="govuk-body">Every body the paper names, with what it is judged on and who gains if the policy fails.</p> },
          { heading: 'What is backed up', summary: '24 claims', content: <p className="govuk-body">Each claim against something outside the paper, or a record that nothing settles it.</p> },
          { heading: 'How they connect', summary: '26 relationship types', content: <p className="govuk-body">Only relationships the paper states. The gaps matter as much as the links.</p> },
        ]}
      />

      {/* HERE SO THE STATIC GATE CAN SEE IT. `npm run a11y` walks this route and
          six others, none of which needs an assessment to exist; the figures
          themselves only appear on a report, where only the browser walk
          reaches them. Carrying one here puts the chart markup, the toggle and
          its pressed state under axe on every run. */}
      <h2 className="govuk-heading-l govuk-!-margin-top-8">Figures</h2>
      <p className="govuk-body">
        Every picture of data on the report is paired with the same data as a table, and the
        control that swaps them is offered to everyone rather than hidden behind assistive
        technology. Neither is the accessible alternative to the other. The bars carry no text
        on the fill: a label written inside is unreadable on the short ones and has to pass
        contrast against the colour, where outside it is black on white everywhere.
      </p>
      <Figure
        label="relationships by family"
        diagram={
          <BarChart
            label="Relationships by family"
            total={388}
            rows={[
              { key: 'money', label: 'Money and burden', value: 222, colour: '#1d70b8' },
              { key: 'accountability', label: 'Accountability', value: 93, colour: '#1d70b8' },
              { key: 'evidence', label: 'Evidence', value: 65, colour: '#1d70b8' },
              { key: 'authority', label: 'Authority', value: 5, colour: '#1d70b8' },
              { key: 'influence', label: 'Influence', value: 3, colour: '#1d70b8' },
            ]}
          />
        }
        table={
          <Table
            caption="Relationships by family"
            captionSize="s"
            scroll
            columns={[{ header: 'Family' }, { header: 'What it covers' }, { header: 'Relationships', numeric: true }]}
            rows={[
              ['Money and burden', 'Who pays, who benefits, who carries the cost', '222'],
              ['Accountability', 'Who answers to whom, and who is measured on what', '93'],
              ['Evidence', 'What is offered in support of a claim', '65'],
              ['Authority', 'Who can direct, veto or sanction whom', '5'],
              ['Influence', 'Who lobbies or allies with whom', '3'],
            ]}
          />
        }
      />

      <h2 className="govuk-heading-l govuk-!-margin-top-8">Telling the reader something</h2>
      <NotificationBanner type="success" title="Assessment finished">
        <p className="govuk-notification-banner__heading">
          The report for <a className="govuk-notification-banner__link" href="#main-content">Draft Schools (Accountability) Bill</a> is ready.
        </p>
      </NotificationBanner>

      <NotificationBanner>
        <p className="govuk-body">
          Three stages recorded warnings. The report is complete, with gaps marked where they fall.
        </p>
      </NotificationBanner>

      <WarningText>
        This is not an assurance review. It will not tell you the policy is fine, and a clean
        report is not evidence that it is.
      </WarningText>

      <InsetText>
        A sealed assessment writes none of the paper in the clear. Destroying the key destroys
        the run — there is no recovery, by design.
      </InsetText>

      <Panel title="Assessment submitted">
        Reference <strong>PA-2026-0041</strong>
      </Panel>

      <h2 className="govuk-heading-l govuk-!-margin-top-8">Asking the reader something</h2>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          {showErrors ? (
            <ErrorSummary
              errors={[
                { text: 'Enter a title for this assessment', href: '#title' },
                { text: 'Select a document to assess', href: '#document' },
                { text: 'The jurisdiction must be 100 characters or fewer', href: '#jurisdiction' },
              ]}
            />
          ) : null}

          <Input id="title" label="What is this paper called?" labelSize="s"
                 hint="Use the title on the front of the document." />
          <Input id="jurisdiction" label="Jurisdiction" labelSize="s"
                 hint="England, Scotland, Wales, Northern Ireland, or UK-wide."
                 error={showErrors ? 'The jurisdiction must be 100 characters or fewer' : undefined} />
          <FileUpload id="document" label="Upload the paper" labelSize="s"
                      hint="PDF, DOCX or plain text, up to 10 MB." accept=".pdf,.docx,.txt" />
          <Select id="area" label="Policy area" labelSize="s"
                  options={[{ value: '', text: 'Choose an area' }, { value: 'education', text: 'Education' }, { value: 'health', text: 'Health' }]} />
          <Radios
            id="depth" legend="How deeply should it read the paper?" legendSize="s"
            hint="A deep read costs more and takes longer."
            value={depth} onChange={setDepth}
            items={[
              { value: 'standard', text: 'Standard', hint: 'One pass over every passage.' },
              { value: 'deep', text: 'Deep', hint: 'Follows each line of enquiry until it stops producing new evidence.' },
            ]}
          />
          <Textarea id="context" label="Anything the paper does not say" labelSize="s"
                    hint="Optional. What you already know that the assessment should take into account." />

          <ButtonGroup>
            <Button onClick={() => setShowErrors(false)}>Start the assessment</Button>
            <Button variant="secondary" onClick={() => setShowErrors(true)}>Show the error state</Button>
            <a className="govuk-link" href="#main-content">Cancel</a>
          </ButtonGroup>
        </div>
      </div>

      <h2 className="govuk-heading-l govuk-!-margin-top-8">Status colours</h2>
      <p className="govuk-body">
        Six states, and the colours are load-bearing only in company with the words — nobody
        should have to tell green from yellow to know what happened.
      </p>
      <p className="govuk-body">
        <Tag colour="grey">Queued</Tag>{' '}
        <Tag colour="blue">Running</Tag>{' '}
        <Tag colour="green">Completed</Tag>{' '}
        <Tag colour="yellow">With gaps</Tag>{' '}
        <Tag colour="red">Failed</Tag>{' '}
        <Tag colour="purple">Cancelled</Tag>
      </p>
    </>
  );
}
