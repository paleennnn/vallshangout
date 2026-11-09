'use client';

import { useId, useState } from 'react';
import { MoneyInput } from '@/components/calculator/MoneyInput';
import { CHILD_CATEGORIES, PARENT_CATEGORIES, usesHourlyRate } from '@/lib/places/categories';
import {
  validatePlace,
  type Place,
  type PlaceErrors,
  type PlaceFormValues,
  type PlaceInput,
} from '@/lib/places/store';

const field =
  'h-11 w-full rounded-control border border-line bg-surface px-3 focus:border-brand aria-[invalid=true]:border-danger';
const labelCls = 'text-sm font-medium text-muted';

function initialValues(place?: Place): PlaceFormValues {
  return {
    name: place?.name ?? '',
    categorySlug: place?.categorySlug ?? 'cafe',
    servicePct: String(place?.servicePct ?? 5),
    taxPct: String(place?.taxPct ?? 10),
    taxOnService: place?.taxOnService ?? true,
    hourlyRate: place?.hourlyRate ?? null,
    mapsUrl: place?.mapsUrl ?? '',
    notes: place?.notes ?? '',
  };
}

export function PlaceForm({
  place,
  onSubmit,
  onCancel,
}: {
  place?: Place;
  onSubmit: (input: PlaceInput) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<PlaceFormValues>(() => initialValues(place));
  const [errors, setErrors] = useState<PlaceErrors>({});
  const id = useId();
  const set = <K extends keyof PlaceFormValues>(key: K, value: PlaceFormValues[K]) =>
    setV((s) => ({ ...s, [key]: value }));

  const err = (key: keyof PlaceErrors) =>
    errors[key] && (
      <p id={`${id}-${key}`} role="alert" className="text-sm text-danger">
        {errors[key]}
      </p>
    );
  const a11y = (key: keyof PlaceErrors) => ({
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `${id}-${key}` : undefined,
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const result = validatePlace(v);
        if (result.ok) onSubmit(result.value);
        else setErrors(result.errors);
      }}
    >
      <label className="block space-y-1.5">
        <span className={labelCls}>Nama tempat</span>
        <input
          value={v.name}
          onChange={(e) => set('name', e.target.value)}
          maxLength={80}
          autoComplete="off"
          placeholder="Mis. Cafe A"
          className={field}
          {...a11y('name')}
        />
        {err('name')}
      </label>

      <label className="block space-y-1.5">
        <span className={labelCls}>Kategori</span>
        <select
          value={v.categorySlug}
          onChange={(e) => set('categorySlug', e.target.value)}
          className={field}
          {...a11y('categorySlug')}
        >
          {PARENT_CATEGORIES.map((parent) => {
            const children = CHILD_CATEGORIES.filter((c) => c.parent === parent.slug);
            return children.length === 0 ? (
              <option key={parent.slug} value={parent.slug}>
                {parent.name}
              </option>
            ) : (
              <optgroup key={parent.slug} label={parent.name}>
                <option value={parent.slug}>{parent.name} (umum)</option>
                {children.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        {err('categorySlug')}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className={labelCls}>Service (%)</span>
          <input
            inputMode="decimal"
            value={v.servicePct}
            onChange={(e) => set('servicePct', e.target.value)}
            className={`${field} text-right`}
            {...a11y('servicePct')}
          />
          {err('servicePct')}
        </label>
        <label className="block space-y-1.5">
          <span className={labelCls}>Pajak (%)</span>
          <input
            inputMode="decimal"
            value={v.taxPct}
            onChange={(e) => set('taxPct', e.target.value)}
            className={`${field} text-right`}
            {...a11y('taxPct')}
          />
          {err('taxPct')}
        </label>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={v.taxOnService}
          onChange={(e) => set('taxOnService', e.target.checked)}
          className="h-5 w-5 accent-brand"
        />
        Pajak dihitung dari (subtotal + service)
      </label>

      {usesHourlyRate(v.categorySlug) && (
        <label className="block space-y-1.5">
          <span className={labelCls}>Sewa per jam (Rp), opsional</span>
          <MoneyInput value={v.hourlyRate} onChange={(n) => set('hourlyRate', n)} placeholder="0" className="h-11" />
        </label>
      )}

      <label className="block space-y-1.5">
        <span className={labelCls}>Tautan Google Maps, opsional</span>
        <input
          type="url"
          inputMode="url"
          value={v.mapsUrl}
          onChange={(e) => set('mapsUrl', e.target.value)}
          placeholder="https://maps.app.goo.gl/..."
          autoComplete="off"
          className={field}
          {...a11y('mapsUrl')}
        />
        {err('mapsUrl')}
      </label>

      <label className="block space-y-1.5">
        <span className={labelCls}>Catatan, opsional</span>
        <textarea
          value={v.notes}
          onChange={(e) => set('notes', e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="Mis. colokan banyak, parkir luas"
          className="w-full rounded-control border border-line bg-surface px-3 py-2 focus:border-brand"
        />
      </label>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="h-12 flex-1 rounded-control bg-sand font-semibold hover:bg-sand-strong"
        >
          Batal
        </button>
        <button type="submit" className="h-12 flex-[2] rounded-control bg-brand font-bold text-ink hover:bg-brand-hover">
          Simpan
        </button>
      </div>
    </form>
  );
}
