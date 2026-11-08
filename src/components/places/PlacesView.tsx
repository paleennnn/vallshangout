'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CalendarCheck, Calculator, ExternalLink, LoaderPinwheel, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { formatIDR } from '@/lib/engine/split';
import { PARENT_CATEGORIES, categoryOf, rootSlug } from '@/lib/places/categories';
import { SAMPLE_PLACES, visitLabel, type Place } from '@/lib/places/store';
import { PlaceForm } from './PlaceForm';
import { usePlaces } from './usePlaces';
import { WheelSheet } from './WheelSheet';

const pct = (n: number) => `${n.toLocaleString('id-ID')}%`;

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-sand"
    >
      {children}
    </button>
  );
}

function PlaceCard({
  place,
  onVisit,
  onEdit,
  onDelete,
}: {
  place: Place;
  onVisit: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cat = categoryOf(place.categorySlug);
  const Icon = cat.icon;
  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-ink">
          <Icon size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold">{place.name}</h3>
          <p className="text-sm text-muted">
            {cat.name}
            {place.hourlyRate ? `, ${formatIDR(place.hourlyRate)} per jam` : ''}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm">
        Service {pct(place.servicePct)}, pajak {pct(place.taxPct)}
        <span className="text-muted">{place.taxOnService ? ' (dari subtotal + service)' : ' (dari subtotal)'}</span>
      </p>
      <p className="text-sm text-muted">{visitLabel(place)}</p>
      {place.notes && <p className="mt-1 text-sm text-muted">{place.notes}</p>}

      <div className="mt-3 space-y-2">
        <Link
          href={`/calculator?place=${place.id}`}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-control bg-brand text-sm font-bold text-ink hover:bg-brand-hover"
        >
          <Calculator size={16} aria-hidden="true" />
          Hitung patungan di sini
        </Link>
        <div className="flex justify-end">
          <IconButton label={`Catat kunjungan ke ${place.name}`} onClick={onVisit}>
            <CalendarCheck size={20} aria-hidden="true" />
          </IconButton>
          {place.mapsUrl && (
            <a
              href={place.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Buka ${place.name} di Maps`}
              title="Buka di Maps"
              className="grid h-11 w-11 place-items-center rounded-full hover:bg-sand"
            >
              <ExternalLink size={20} aria-hidden="true" />
            </a>
          )}
          <IconButton label={`Ubah ${place.name}`} onClick={onEdit}>
            <Pencil size={20} aria-hidden="true" />
          </IconButton>
          <IconButton label={`Hapus ${place.name}`} onClick={onDelete}>
            <Trash2 size={20} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </li>
  );
}

export function PlacesView() {
  const { places, ready, add, addMany, update, remove, visit } = usePlaces();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<Place | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Place | null>(null);
  const [wheelOpen, setWheelOpen] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places
      .filter((p) => filter === 'all' || rootSlug(p.categorySlug) === filter)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || categoryOf(p.categorySlug).name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [places, query, filter]);

  if (!ready) return <p className="text-muted">Memuat…</p>;

  const chip = (active: boolean) =>
    `inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold ${
      active ? 'bg-brand text-ink' : 'border border-line bg-surface hover:bg-sand'
    }`;

  if (places.length === 0) {
    return (
      <>
        <section className="space-y-4 rounded-card border border-line bg-surface p-5">
          <div className="space-y-1">
            <h2 className="font-semibold">Belum ada tempat</h2>
            <p className="text-sm text-muted">
              Simpan tempat langgananmu beserta service dan pajaknya. Di kalkulator, angkanya terisi otomatis,
              dan roda bisa memilih dari daftar ini.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="inline-flex h-11 items-center gap-2 rounded-control bg-brand px-4 font-bold text-ink hover:bg-brand-hover"
            >
              <Plus size={18} aria-hidden="true" />
              Tambah tempat
            </button>
            <button
              type="button"
              onClick={() => addMany(SAMPLE_PLACES)}
              className="h-11 rounded-control bg-sand px-4 text-sm font-semibold hover:bg-sand-strong"
            >
              Coba dengan contoh
            </button>
          </div>
        </section>
        <PlaceSheets
          editing={editing}
          setEditing={setEditing}
          deleting={deleting}
          setDeleting={setDeleting}
          add={add}
          update={update}
          remove={remove}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari tempat"
          aria-label="Cari tempat"
          className="h-11 w-full rounded-control border border-line bg-surface pl-10 pr-3 focus:border-brand"
        />
      </div>

      <div
        role="group"
        aria-label="Filter kategori"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0"
      >
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={chip(filter === 'all')}>
          Semua
        </button>
        {PARENT_CATEGORIES.map((c) => (
          <button key={c.slug} type="button" aria-pressed={filter === c.slug} onClick={() => setFilter(c.slug)} className={chip(filter === c.slug)}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-control bg-brand font-bold text-ink hover:bg-brand-hover"
        >
          <Plus size={18} aria-hidden="true" />
          Tambah
        </button>
        <button
          type="button"
          disabled={visible.length < 2}
          onClick={() => setWheelOpen(true)}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-control bg-sand font-semibold hover:bg-sand-strong disabled:opacity-50"
        >
          <LoaderPinwheel size={18} aria-hidden="true" />
          Putar roda
        </button>
      </div>
      {visible.length < 2 && (
        <p className="-mt-2 text-xs text-muted">Roda butuh minimal 2 tempat pada daftar yang sedang tampil.</p>
      )}

      {visible.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-5 text-sm text-muted">Tidak ada tempat yang cocok.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((p) => (
            <PlaceCard
              key={p.id}
              place={p}
              onVisit={() => visit(p.id)}
              onEdit={() => setEditing(p)}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </ul>
      )}

      <WheelSheet open={wheelOpen} onClose={() => setWheelOpen(false)} places={visible} onVisit={visit} />
      <PlaceSheets
        editing={editing}
        setEditing={setEditing}
        deleting={deleting}
        setDeleting={setDeleting}
        add={add}
        update={update}
        remove={remove}
      />
    </div>
  );
}

function PlaceSheets({
  editing,
  setEditing,
  deleting,
  setDeleting,
  add,
  update,
  remove,
}: {
  editing: Place | 'new' | null;
  setEditing: (v: Place | 'new' | null) => void;
  deleting: Place | null;
  setDeleting: (v: Place | null) => void;
  add: ReturnType<typeof usePlaces>['add'];
  update: ReturnType<typeof usePlaces>['update'];
  remove: ReturnType<typeof usePlaces>['remove'];
}) {
  return (
    <>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Tambah tempat' : 'Ubah tempat'}>
        <PlaceForm
          place={editing && editing !== 'new' ? editing : undefined}
          onCancel={() => setEditing(null)}
          onSubmit={(input) => {
            if (editing && editing !== 'new') update(editing.id, input);
            else add(input);
            setEditing(null);
          }}
        />
      </Sheet>

      <Sheet open={deleting !== null} onClose={() => setDeleting(null)} title="Hapus tempat?">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            <b className="text-ink">{deleting?.name}</b> akan dihapus dari perangkat ini beserta catatan kunjungannya.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDeleting(null)} className="h-12 flex-1 rounded-control bg-sand font-semibold hover:bg-sand-strong">
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                if (deleting) remove(deleting.id);
                setDeleting(null);
              }}
              className="h-12 flex-1 rounded-control bg-danger font-bold text-white hover:opacity-90"
            >
              Hapus
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
