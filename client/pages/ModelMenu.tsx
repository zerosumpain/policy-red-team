import { useState } from 'react';
import { admin, type AdminConfig, type CatalogueEntry, type OfferedModel } from '../api';
import { Button, ButtonGroup, Checkboxes, InsetText, Input, SummaryList, Tag, WarningText } from '../govuk';

/** `$0.05/M` rather than `0.00000005`, because nobody compares eight leading zeroes. */
export function price(usdPerMillion: number | null): string {
  if (usdPerMillion === null) return 'no quoted price';
  if (usdPerMillion === 0) return 'free';
  const rounded =
    usdPerMillion < 1 ? usdPerMillion.toFixed(2) : usdPerMillion.toFixed(usdPerMillion < 10 ? 1 : 0);
  return `$${rounded}/M`;
}

export function context(tokens: number | null): string {
  if (!tokens) return '';
  return tokens >= 1_000_000
    ? `${Math.round(tokens / 1_000_000)}M context`
    : `${Math.round(tokens / 1000)}k context`;
}

/**
 * WHICH MODELS AN ASSESSMENT MAY BE RUN ON.
 *
 * Two lists that must not be confused. The provider's CATALOGUE is inventory —
 * 447 rows on OpenRouter, most of them irrelevant to reading a policy paper. The
 * MENU is a decision: the handful the submit form offers, each carrying a note
 * about what it is for. This page turns the first into the second.
 *
 * THE CATALOGUE IS FETCHED ON DEMAND, NEVER ON LOAD. It is a network call to a
 * third party, and this panel is mostly opened to check a key rather than to go
 * shopping. Nothing should be slow for everybody in order to serve the rarer
 * case.
 *
 * SEARCH RATHER THAN SCROLL, and with an empty box nothing is listed except what
 * is already chosen. A checkbox list of 447 rows is not a control, it is a wall.
 * `Checkboxes` keeps a ticked id that has scrolled out of the filter, so
 * narrowing the search cannot silently drop a choice — which it used to.
 */
export function ModelMenu({ config, busy, onSave }: {
  config: AdminConfig;
  busy: boolean;
  onSave: (models: { id: string; name: string; note: string; cost: number | null }[]) => void;
}) {
  const [entries, setEntries] = useState<CatalogueEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string[]>(() => config.menu.map((m) => m.id));

  // What the reader picked, as a record worth saving: the catalogue row where we
  // have one, otherwise whatever the menu already said. An id that was in the
  // menu before a browse has to survive a save that happens after one.
  const known = new Map<string, OfferedModel>(config.menu.map((m) => [m.id, m]));
  const rows = new Map<string, CatalogueEntry>((entries ?? []).map((e) => [e.id, e]));

  const toSave = chosen.map((id) => {
    const row = rows.get(id);
    const existing = known.get(id);
    return {
      id,
      name: row?.name ?? existing?.name ?? id,
      note: row?.description ?? existing?.note ?? '',
      cost: row ? row.promptCost : null,
    };
  });

  async function browse() {
    setLoading(true);
    setFailure('');
    try {
      setEntries((await admin.catalogue()).entries);
    } catch (err) {
      setFailure((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const needle = query.trim().toLowerCase();
  const matches = (entries ?? []).filter((e) =>
    needle
      ? e.id.toLowerCase().includes(needle) || e.name.toLowerCase().includes(needle)
      : chosen.includes(e.id),
  );
  const visible = matches.slice(0, 40);
  const hidden = matches.length - visible.length;
  const dirty = chosen.join(' ') !== config.menu.map((m) => m.id).join(' ');
  const providerLabel = config.providers.find((p) => p.id === config.active)?.label ?? 'this provider';

  return (
    <section aria-labelledby="admin-models">
      <h2 className="govuk-heading-m" id="admin-models">Which models an assessment can use</h2>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <p className="govuk-body">
            This is the list the submit form offers. An eighteen-stage assessment makes one model
            call per passage in decomposition alone, so the difference between a cheap model and a
            frontier one is a bill rather than a rounding error.
          </p>

          {config.menuPinned ? (
            <InsetText>
              <strong>POLICY_MODELS is set on the server</strong>, which pins this menu. The
              environment wins over anything chosen here, so this page cannot change it.
            </InsetText>
          ) : null}

          <SummaryList
            rows={[
              {
                key: 'Offered now',
                value: config.menu.length
                  ? config.menu.map((m) => m.name).join(', ')
                  : 'Nothing, which means the picker will not appear on the submit form.',
              },
              {
                key: 'Chosen by',
                value: config.menuPinned
                  ? 'POLICY_MODELS on the server.'
                  : config.menuChosen
                    ? 'This page.'
                    : 'Nobody — these are the models this build ships with.',
              },
            ]}
          />

          {config.menuPinned ? null : !entries ? (
            <>
              {config.canBrowse ? (
                <ButtonGroup>
                  <Button
                    variant="secondary"
                    disabled={busy || loading}
                    onClick={() => void browse()}
                  >
                    {loading ? 'Asking…' : `Browse what ${providerLabel} offers`}
                  </Button>
                </ButtonGroup>
              ) : (
                <InsetText>
                  This provider does not publish a list of what it serves, so there is nothing to
                  browse. Whatever you configured for it is what an assessment will use.
                </InsetText>
              )}
              {failure ? <WarningText>{failure}</WarningText> : null}
            </>
          ) : (
            <>
              <Input
                id="model-search"
                name="modelSearch"
                label="Search the catalogue"
                labelSize="s"
                hint={`${entries.length} models available. Type part of a name or an id — with the box empty, only what you have already chosen is listed.`}
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                disabled={busy}
              />

              {visible.length ? (
                <Checkboxes
                  id="models"
                  small
                  legend="Offer these"
                  legendSize="s"
                  values={chosen}
                  onChange={setChosen}
                  items={visible.map((e) => ({
                    value: e.id,
                    text: (
                      <>
                        {e.name} {e.floating ? <Tag colour="yellow">Floating</Tag> : null}
                      </>
                    ),
                    hint: (
                      <>
                        <code>{e.id}</code>
                        {' — '}
                        {price(e.promptCost)} in, {price(e.completionCost)} out
                        {context(e.contextLength) ? `, ${context(e.contextLength)}` : ''}
                        {/* A floating id is a different KIND of choice, and the reader
                            should know they made it: the model behind it changes without
                            the id changing, so two assessments a month apart are not
                            comparable even though the provenance section names the same
                            thing. */}
                        {e.floating ? (
                          <>
                            <br />
                            Redirects to whatever is newest in its family, so what answers can
                            change between one assessment and the next.
                          </>
                        ) : null}
                      </>
                    ),
                  }))}
                />
              ) : (
                <p className="govuk-body">
                  {needle ? 'Nothing matches that.' : 'Nothing chosen yet. Search to add something.'}
                </p>
              )}

              {hidden > 0 ? (
                <p className="govuk-body-s prt-meta">
                  {hidden} more match that search. Narrow it to see them — anything already ticked
                  stays ticked whether or not it is listed.
                </p>
              ) : null}

              <p className="govuk-body" role="status">
                {chosen.length} chosen{dirty ? ', not saved yet' : ''}.
              </p>

              <ButtonGroup>
                <Button disabled={busy || !dirty} onClick={() => onSave(toSave)}>
                  Save the menu
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || !config.menuChosen}
                  onClick={() => { setChosen(config.builtIn.map((m) => m.id)); onSave([]); }}
                >
                  Reset to the built-in {config.builtIn.length}
                </Button>
              </ButtonGroup>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
