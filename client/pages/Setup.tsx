import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { admin, type AdminConfig, type SetupState } from '../api';
import { Button, ButtonGroup, ErrorSummary, InsetText, Input, Radios, Table, TaskList, WarningText } from '../govuk';
import { usePageTitle } from '../layout/Template';
import { MEASURED_SCALE } from '../measured';

/**
 * GETTING THIS INSTALL WORKING, ONE THING AT A TIME.
 *
 * `/admin` is a panel: everything at once, for somebody who already knows what
 * the fields mean. It is the right shape for the third visit and the wrong one
 * for the first, and until now the first visit did not exist — a fresh clone
 * had no browser-reachable route to configuration at all, and the variable that
 * opened one was named in no file a newcomer reads.
 *
 * THIS IS THE SAME ENDPOINTS, WALKED IN ORDER. Not a second configuration
 * system: every step here POSTs to the `/api/admin/*` route the panel already
 * used, and the task list's statuses are computed by the server from what the
 * install actually holds. A wizard that kept its own idea of "done" would be a
 * second opinion about the thing the server already knows, and the two would
 * disagree the first time somebody used the panel instead.
 *
 * IT IS THE GOV.UK PATTERN, AND THE PATTERN IS THE ARGUMENT. One thing per
 * page, a task list with statuses, a "check your answers" at the end. It suits
 * a journey where the steps are independent, can be done in any order, and are
 * each a single decision — which is exactly what configuring this is.
 *
 * `client/govuk/TaskList.tsx` already implements the list, including the
 * `aria-describedby` wiring that is the component: without it a screen reader
 * gets a list of links whose statuses are read out as loose text somewhere
 * nearby.
 */

/** Everything the steps share: the heading, the caption, and the way back. */
function Step({ caption, title, children, intro }: {
  caption: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  usePageTitle(title);
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <span className="govuk-caption-l">{caption}</span>
        <h1 className="govuk-heading-l">{title}</h1>
        {intro}
        {children}
      </div>
    </div>
  );
}

function useSetup() {
  const [state, setState] = useState<SetupState | null>(null);
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /*
   * WHETHER THE ANSWER WAS "SIGN IN FIRST", which is a different thing from an
   * error and needs a different page.
   *
   * Without this the journey renders "Loading…" for ever to anybody who opens
   * it without a session — which is most people the first time, because the
   * link is on the landing page and the session is on the panel. A spinner that
   * never resolves is the worst of the three possible answers: it does not say
   * what is wrong and it does not say what to do.
   */
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const load = useCallback(async () => {
    try {
      const [next, cfg] = await Promise.all([admin.setup(), admin.config()]);
      setState(next);
      setConfig(cfg);
      setNeedsSignIn(false);
    } catch (err) {
      const message = (err as Error).message;
      if (/sign in/i.test(message)) setNeedsSignIn(true);
      else setErrors([message]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = useCallback(async <T,>(work: () => Promise<T>, then?: (r: T) => void) => {
    setBusy(true);
    setErrors([]);
    try {
      const result = await work();
      then?.(result);
      await load();
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setBusy(false);
    }
  }, [load]);

  return { state, config, errors, setErrors, busy, run, reload: load, needsSignIn };
}

/** Shown wherever the journey is opened without an admin session. */
function SignInFirst() {
  usePageTitle('Set up this service');
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <span className="govuk-caption-l">Set up</span>
        <h1 className="govuk-heading-l">Sign in to set this up</h1>
        <p className="govuk-body">
          Configuring this service means handling the credentials it makes model calls with, so it
          is behind the admin password. Everything else here is as open as this install is.
        </p>
        <p className="govuk-body">
          <Link className="govuk-link" to="/admin">Sign in</Link>, then come back.
        </p>
      </div>
    </div>
  );
}

const TAG: Record<string, { text: string; colour: 'green' | 'blue' | 'grey' }> = {
  done: { text: 'Done', colour: 'green' },
  todo: { text: 'To do', colour: 'blue' },
  optional: { text: 'Optional', colour: 'grey' },
};

/** The hub. Every task, what state it is in, and what is still missing. */
export function SetupIndex() {
  const { state, errors, needsSignIn } = useSetup();
  usePageTitle('Set up this service');
  if (needsSignIn) return <SignInFirst />;
  if (!state) return <p className="govuk-body" aria-live="polite">Loading…</p>;

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <span className="govuk-caption-l">Set up</span>
        <h1 className="govuk-heading-l">Get this service working</h1>
        {errors.length ? <ErrorSummary errors={errors.map((text) => ({ text, href: '/setup' }))} /> : null}

        {state.ready ? (
          <InsetText>
            This install can reach a model. {state.provider} has answered a real call, which is the
            only thing that actually proves it.
          </InsetText>
        ) : (
          <p className="govuk-body">
            Work through these in any order. Nothing can run an assessment until a model has
            answered — <strong>configured is not the same claim as reachable</strong>, so the last
            step makes one real call and that is what counts as done.
          </p>
        )}

        <TaskList
          idPrefix="setup"
          items={state.tasks.map((task) => ({
            title: <Link className="govuk-link govuk-task-list__link" to={task.href}>{task.title}</Link>,
            hint: task.detail,
            status: { tag: TAG[task.status] ?? TAG.todo },
          }))}
        />

        <p className="govuk-body">
          <Link className="govuk-link" to="/admin">Or open the configuration panel</Link>, which has
          everything on one page.
        </p>
      </div>
    </div>
  );
}

/** Which service answers. Radios, because it is one choice from a short list. */
export function SetupService() {
  const { config, errors, busy, run, needsSignIn } = useSetup();
  const navigate = useNavigate();
  if (needsSignIn) return <SignInFirst />;
  if (!config) return <p className="govuk-body" aria-live="polite">Loading…</p>;

  return (
    <Step
      caption="Set up"
      title="Which service answers"
      intro={
        <p className="govuk-body">
          Every model call this service makes goes to one of these. You can change it later;
          nothing already running is affected.
        </p>
      }
    >
      {errors.length ? <ErrorSummary errors={errors.map((text) => ({ text, href: '#setup-provider' }))} /> : null}
      {config.pinned ? (
        <InsetText>POLICY_PROVIDER is set on the server, so this cannot be changed here.</InsetText>
      ) : (
        <Radios
          id="setup-provider"
          legend="Use this one"
          legendSize="s"
          value={config.active}
          onChange={(id) => void run(() => admin.use(id), () => navigate(`/setup/service/${id}`))}
          items={config.providers.map((p) => ({ value: p.id, text: p.label, hint: p.blurb }))}
        />
      )}
      <ButtonGroup>
        <Button variant="secondary" onClick={() => navigate('/setup')} disabled={busy}>Back to the list</Button>
      </ButtonGroup>
    </Step>
  );
}

/**
 * Connecting the chosen service.
 *
 * It renders the SAME fields the panel does, from the same server-side
 * definition — including `showWhen`, so an Azure tenant using Entra is asked
 * for a tenant and a client id and never for a key it does not have.
 */
export function SetupConnect() {
  const { id } = useParams();
  const { config, errors, busy, run, needsSignIn } = useSetup();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  if (needsSignIn) return <SignInFirst />;
  if (!config) return <p className="govuk-body" aria-live="polite">Loading…</p>;

  const provider = config.providers.find((p) => p.id === id);
  if (!provider) return <InsetText>This build does not offer that service.</InsetText>;

  const answerFor = (name: string): string => {
    if (answers[name] !== undefined) return answers[name];
    const stored = provider.values[name];
    if (typeof stored === 'string' && stored.trim()) return stored;
    return provider.fields.find((f) => f.name === name)?.options?.[0]?.value ?? '';
  };
  const visible = (field: (typeof provider.fields)[number]) =>
    !field.showWhen || field.showWhen.is.includes(answerFor(field.showWhen.field));

  // Read the value NOW rather than inside the updater: React nulls the
  // synthetic event's `currentTarget` once the handler returns, and a
  // functional updater runs later. See `Admin.tsx`, where that crashed the page.
  const remember = (name: string, value: string) => setAnswers((a) => ({ ...a, [name]: value }));

  return (
    <Step caption="Set up" title={`Connect ${provider.label}`} intro={<p className="govuk-body">{provider.blurb}</p>}>
      {errors.length ? <ErrorSummary errors={errors.map((text) => ({ text, href: `#${provider.id}-${provider.fields[0]?.name}` }))} /> : null}
      <form
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const values: Record<string, string> = {};
          for (const field of provider.fields) {
            if (!visible(field)) continue;
            const raw = form.get(field.name);
            const value = typeof raw === 'string' ? raw : '';
            if (field.secret && !value.trim() && provider.values[field.name] === true) continue;
            values[field.name] = value;
          }
          void run(() => admin.save(provider.id, values), () => navigate('/setup/test'));
        }}
        noValidate
      >
        {provider.fields.filter(visible).map((field) => {
          const stored = provider.values[field.name];
          const controls = provider.fields.some((f) => f.showWhen?.field === field.name);
          const hint = (
            <>
              {field.hint}
              {field.secret ? (
                <>
                  {' '}
                  {stored === true
                    ? 'One is stored. Leave this blank to keep it, or type a new one to replace it.'
                    : 'Nothing is stored.'}{' '}
                  It is never shown again once saved.
                </>
              ) : null}
            </>
          );
          if (field.kind === 'select') {
            return (
              <Radios
                key={field.name}
                id={`${provider.id}-${field.name}`}
                name={field.name}
                legend={field.label}
                legendSize="s"
                hint={hint}
                value={answerFor(field.name)}
                onChange={(value) => remember(field.name, value)}
                items={(field.options ?? []).map((o) => ({ value: o.value, text: o.text }))}
              />
            );
          }
          return (
            <Input
              key={field.name}
              id={`${provider.id}-${field.name}`}
              name={field.name}
              type={field.secret ? 'password' : 'text'}
              label={field.label}
              labelSize="s"
              autoComplete="off"
              placeholder={field.placeholder}
              defaultValue={field.secret ? '' : typeof stored === 'string' ? stored : ''}
              hint={hint}
              disabled={busy}
              {...(controls ? { value: answerFor(field.name), onChange: (e: { currentTarget: { value: string } }) => remember(field.name, e.currentTarget.value) } : {})}
            />
          );
        })}
        <ButtonGroup>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</Button>
          <Button variant="secondary" onClick={() => navigate('/setup')} disabled={busy}>Back to the list</Button>
        </ButtonGroup>
      </form>

      {provider.id === 'codex' ? (
        <WarningText>
          A bridge is reachable from the machine running this service, not from yours. If this
          service is on another box, a loopback address here will never connect.
        </WarningText>
      ) : null}
    </Step>
  );
}

/**
 * THE ONLY STEP THAT PROVES ANYTHING.
 *
 * Everything before it is a claim about configuration. This makes one real call
 * for a single token, which is the smallest honest question, and it is the one
 * status the server records rather than derives.
 */
export function SetupTest() {
  const { errors, busy, run, reload, needsSignIn } = useSetup();
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  if (needsSignIn) return <SignInFirst />;

  return (
    <Step
      caption="Set up"
      title="Try the connection"
      intro={
        <p className="govuk-body">
          This makes one real call, for a single token, against whatever is configured now.
          <strong> Saved is not the same claim as reachable</strong>: an expired key, a bridge on
          another machine and a renamed deployment all look identical until something asks.
        </p>
      }
    >
      {errors.length ? <ErrorSummary errors={errors.map((text) => ({ text, href: '#setup-test' }))} /> : null}
      <p className="govuk-body" role="status" id="setup-test">
        {outcome ? outcome.text : ''}
      </p>
      {outcome && !outcome.ok ? (
        <InsetText>
          Whatever the service said is above, word for word. It is usually the most useful thing
          you will get — a 401 is the credential, a 404 is the deployment name, and a timeout
          reaching nothing at all is the network.
        </InsetText>
      ) : null}
      <ButtonGroup>
        <Button
          disabled={busy}
          onClick={() =>
            void run(
              () => admin.test(),
              (result) =>
                setOutcome({
                  ok: result.ok,
                  text: result.ok
                    ? `${result.provider} answered as ${result.model} in ${result.ms} ms.`
                    : `${result.provider} did not answer: ${result.message}`,
                }),
            )
          }
        >
          {busy ? 'Trying…' : 'Try it'}
        </Button>
        <Button variant="secondary" onClick={() => { void reload(); navigate('/setup'); }} disabled={busy}>
          Back to the list
        </Button>
      </ButtonGroup>
    </Step>
  );
}

/** Who may read the assessments — a different question from who may configure them. */
export function SetupAccess() {
  const { config, errors, busy, run, needsSignIn } = useSetup();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'open' | 'password' | null>(null);
  if (needsSignIn) return <SignInFirst />;
  if (!config) return <p className="govuk-body" aria-live="polite">Loading…</p>;
  const chosen = mode ?? config.access;

  return (
    <Step
      caption="Set up"
      title="Who can reach it"
      intro={
        <p className="govuk-body">
          This is a different password from the one that opens this page. Somebody who can read an
          assessment should not thereby hold the key to your model credentials.
        </p>
      }
    >
      {errors.length ? <ErrorSummary errors={errors.map((text) => ({ text, href: '#setup-access' }))} /> : null}
      {config.accessPinned ? <InsetText>POLICY_ACCESS is set on the server, so this cannot be changed here.</InsetText> : null}
      <InsetText>{config.accessSummary}</InsetText>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          void run(
            () => admin.setAccess(chosen, String(form.get('readerPassword') ?? '') || undefined),
            () => navigate('/setup'),
          );
        }}
        noValidate
      >
        <Radios
          id="setup-access"
          legend="Who can open this service"
          legendSize="s"
          value={chosen}
          onChange={(value) => setMode(value as 'open' | 'password')}
          items={[
            { value: 'open', text: 'Anyone who can reach it', hint: 'Right for a laptop. Wrong for anything with a hostname.' },
            { value: 'password', text: 'Only with a reader password', hint: 'A separate password, for people who read assessments but do not configure anything.' },
          ]}
        />
        {chosen === 'password' ? (
          <Input
            id="setup-reader-password"
            name="readerPassword"
            type="password"
            label="Reader password"
            labelSize="s"
            hint="At least twelve characters. Leave blank to keep the one already set."
            autoComplete="new-password"
            disabled={busy || config.accessPinned}
          />
        ) : null}
        <ButtonGroup>
          <Button type="submit" disabled={busy || config.accessPinned}>Save and continue</Button>
          <Button variant="secondary" onClick={() => navigate('/setup')} disabled={busy}>Back to the list</Button>
        </ButtonGroup>
      </form>
    </Step>
  );
}

/** The ceiling, because a subscription-billed run costs nothing per call. */
export function SetupSpend() {
  const { config, errors, busy, run, needsSignIn } = useSetup();
  const navigate = useNavigate();
  if (needsSignIn) return <SignInFirst />;
  if (!config) return <p className="govuk-body" aria-live="polite">Loading…</p>;

  return (
    <Step
      caption="Set up"
      title="What one run may spend"
      intro={
        <p className="govuk-body">
          A run billed to a subscription costs nothing per call, so nothing stops it if it goes
          wrong. This does. A run that passes the ceiling is stopped where it stands and keeps the
          stages it finished — you can raise this and resume.
        </p>
      }
    >
      {errors.length ? <ErrorSummary errors={errors.map((text) => ({ text, href: '#setup-ceiling' }))} /> : null}
      <p className="govuk-body-s prt-meta">{MEASURED_SCALE} Leave it at 0 for no ceiling.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = Number(new FormData(e.currentTarget).get('tokens'));
          void run(() => admin.setCeiling(value), () => navigate('/setup'));
        }}
        noValidate
      >
        <Input
          id="setup-ceiling"
          name="tokens"
          type="number"
          label="Token ceiling for one run"
          labelSize="s"
          hint="0 for no ceiling."
          defaultValue={String(config.tokenCeiling ?? 0)}
          disabled={busy}
        />
        <ButtonGroup>
          <Button type="submit" disabled={busy}>Save and continue</Button>
          <Button variant="secondary" onClick={() => navigate('/setup')} disabled={busy}>Back to the list</Button>
        </ButtonGroup>
      </form>
    </Step>
  );
}

/**
 * THE LIST A NETWORK TEAM ASKS FOR.
 *
 * Gathered from the providers themselves rather than written down here, so a
 * new provider cannot be added without its hosts appearing — which is how
 * `login.microsoftonline.com` would otherwise get left off a firewall change
 * and the failure arrive a week later as "Entra does not work".
 */
export function SetupEgress() {
  const { state, needsSignIn } = useSetup();
  if (needsSignIn) return <SignInFirst />;
  if (!state) return <p className="govuk-body" aria-live="polite">Loading…</p>;

  return (
    <Step
      caption="Set up"
      title="What this needs to reach"
      intro={
        <p className="govuk-body">
          In a restricted network these have to be allowed out. Only the service you actually
          configure is used — the rest are here so you can ask for them once rather than twice.
        </p>
      }
    >
      <Table
        caption="Outbound hosts, HTTPS on 443"
        columns={[{ header: 'Host' }]}
        rows={state.egress.map((host) => [host])}
      />
      <h2 className="govuk-heading-m">What it does not do</h2>
      <ul className="govuk-list govuk-list--bullet">
        <li>No telemetry, no update check, no analytics.</li>
        <li>No content delivery network and no web font: everything the page needs ships with it.</li>
        <li>Nothing is sent anywhere except the model service you configure, and the search service if you configure one.</li>
      </ul>
      <p className="govuk-body">
        <Link className="govuk-link" to="/setup">Back to the list</Link>
      </p>
    </Step>
  );
}
