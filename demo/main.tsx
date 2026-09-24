import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SchemaForm, type FieldError, type JSONSchema, type ResolveWidget, type UiSchema } from 'react-simple-schema-form';
import 'react-simple-schema-form/styles.css';
import { examples } from './examples';
import { demoWidgets as widgets } from './widgets';
import { schedulerRules } from './rules';

// Rule-based selection: runs after uiSchema and inline ui:widget, before defaults.
// Lets schemas stay free of UI keywords (or use their own, like `x-widget`).
const resolveWidget: ResolveWidget = ({ schema }) => {
  if (typeof schema['x-widget'] === 'string') return schema['x-widget'];
  if (schema.format === 'epoch' || schema.format === 'epoch-ms') return 'epoch';
  return undefined;
};

function parseJson<T>(text: string): { value?: T; error?: string } {
  try {
    return { value: JSON.parse(text) as T };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function App() {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [schemaText, setSchemaText] = useState(() => JSON.stringify(examples[0]!.schema, null, 2));
  const [uiText, setUiText] = useState(() => JSON.stringify(examples[0]!.uiSchema, null, 2));
  const [data, setData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [submitted, setSubmitted] = useState<unknown>(null);

  const schema = useMemo(() => parseJson<JSONSchema>(schemaText), [schemaText]);
  const uiSchema = useMemo(() => parseJson<UiSchema>(uiText), [uiText]);

  const loadExample = (index: number) => {
    const ex = examples[index]!;
    setExampleIndex(index);
    setSchemaText(JSON.stringify(ex.schema, null, 2));
    setUiText(JSON.stringify(ex.uiSchema, null, 2));
    setData({});
    setErrors([]);
    setSubmitted(null);
  };

  return (
    <main>
      <section>
        <h2>Schema</h2>
        <label>
          Example{' '}
          <select value={exampleIndex} onChange={(e) => loadExample(Number(e.target.value))}>
            {examples.map((ex, i) => (
              <option key={ex.name} value={i}>{ex.name}</option>
            ))}
          </select>
        </label>
        <textarea className="editor" value={schemaText} onChange={(e) => setSchemaText(e.target.value)} spellCheck={false} />
        {schema.error && <p className="bad">{schema.error}</p>}

        <h3>uiSchema</h3>
        <textarea className="editor editor--small" value={uiText} onChange={(e) => setUiText(e.target.value)} spellCheck={false} />
        {uiSchema.error && <p className="bad">{uiSchema.error}</p>}

        <h3>Live data</h3>
        <pre>{JSON.stringify(data, null, 2)}</pre>
        <h3>Errors</h3>
        <pre>{JSON.stringify(errors, null, 2)}</pre>
        {submitted !== null && (
          <>
            <h3>Submitted</h3>
            <pre>{JSON.stringify(submitted, null, 2)}</pre>
          </>
        )}
      </section>
      <section>
        <h2>Generated form</h2>
        {schema.value && uiSchema.value && (
          <SchemaForm
            // Remount when the schema changes so defaults are recomputed.
            key={schemaText}
            schema={schema.value}
            uiSchema={uiSchema.value}
            widgets={widgets}
            resolveWidget={resolveWidget}
            validate={schedulerRules}
            onChange={(next, errs) => {
              setData(next);
              setErrors(errs);
            }}
            onSubmit={(value) => setSubmitted(value)}
          />
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
