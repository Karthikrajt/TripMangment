import { useState } from 'react';

/** Tiny form-state helper: values, per-field errors, and string setters. */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof T | '_form', string>>>({});
  const bind = (k: keyof T) => ({
    value: (values[k] ?? '') as string,
    error: errors[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setValues((v) => ({ ...v, [k]: e.target.value }));
      if (errors[k]) setErrors((er) => ({ ...er, [k]: undefined }));
    },
  });
  const set = <K extends keyof T>(k: K, v: T[K]) => setValues((s) => ({ ...s, [k]: v }));
  return { values, setValues, errors, setErrors, bind, set };
}
