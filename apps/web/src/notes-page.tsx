import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';

import { ApiError, api } from './api.js';
import type { Deck, ExcelImportPreview, ExcelImportResult, Note } from './card-types.js';

const noteSchema = z.object({
  deckId: z.uuid('Vui lòng chọn bộ thẻ.'),
  noteType: z.enum(['Basic', 'BasicAndReverse', 'Cloze']),
  front: z.string().trim().min(1, 'Mặt trước là bắt buộc.'),
  back: z.string().trim().min(1, 'Mặt sau là bắt buộc.'),
  tags: z.string()
});

type NoteForm = z.infer<typeof noteSchema>;
const notesPerPage = 12;

const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? error.status === 401
      ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
      : error.status === 403
        ? 'Bạn không có quyền thực hiện thao tác này.'
        : error.status === 404
          ? 'Không tìm thấy dữ liệu bạn yêu cầu.'
          : error.status >= 500
            ? 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.'
            : error.message
    : error instanceof z.ZodError
      ? (error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.')
      : 'Đã xảy ra lỗi. Vui lòng thử lại.';

function ButtonContent({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <>
      {loading && <span className="button-spinner" aria-hidden="true" />}
      <span>{children}</span>
    </>
  );
}

function FormError({ message }: { message?: string | undefined }) {
  return (
    <span
      className="form-error"
      role={message === undefined ? undefined : 'alert'}
      aria-hidden={message === undefined}
    >
      {message ?? '\u00a0'}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div className="card-list" aria-label="Đang tải dữ liệu" aria-busy="true">
      {[1, 2, 3].map((item) => (
        <div className="skeleton-card" key={item}>
          <span className="skeleton" style={{ width: '42%', height: 24 }} />
          <span className="skeleton" style={{ width: '88%', height: 16, marginTop: 20 }} />
          <span className="skeleton" style={{ width: '60%', height: 16, marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}

function QueryError({ title, onRetry }: { title: string; onRetry(): void }) {
  return (
    <section className="page-state error" role="alert">
      <h2>{title}</h2>
      <p>Vui lòng kiểm tra kết nối và thử lại.</p>
      <button className="secondary" onClick={onRetry}>
        Thử lại
      </button>
    </section>
  );
}

function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="page-state">
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function noteFormValues(note: Note | null, decks: Deck[]): NoteForm {
  const fields = note === null ? {} : parseJson<Record<string, string>>(note.fieldsJson, {});
  const tags = note === null ? [] : parseJson<string[]>(note.tagsJson, []);
  return {
    deckId: note?.deckId ?? decks[0]?.id ?? '',
    noteType: note?.noteType ?? 'Basic',
    front: fields.front ?? fields.text ?? '',
    back: fields.back ?? '',
    tags: tags.join(', ')
  };
}

function NoteEditor({ decks, note, done }: { decks: Deck[]; note: Note | null; done(): void }) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<NoteForm>({ defaultValues: noteFormValues(note, decks) });
  useEffect(() => form.reset(noteFormValues(note, decks)), [decks, form, note]);
  const save = useMutation({
    mutationFn: async (values: NoteForm) => {
      const input = noteSchema.parse(values);
      const body = {
        deckId: input.deckId,
        noteType: input.noteType,
        fields:
          input.noteType === 'Cloze'
            ? { text: input.front, back: input.back }
            : { front: input.front, back: input.back },
        tags: input.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      };
      if (note === null) {
        const created = await api.post<Note>('/notes', body);
        await api.post(`/notes/${created.id}/generate-cards`, {});
      } else {
        await api.patch<Note>(`/notes/${note.id}`, body);
      }
    },
    onSuccess: done,
    onError: (error) => setSubmitError(errorMessage(error))
  });
  const editing = note !== null;
  return (
    <section className="panel">
      <h2>{editing ? 'Sửa thẻ' : 'Tạo thẻ'}</h2>
      <form
        className="editor-form"
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        noValidate
      >
        <label>
          Bộ thẻ
          <select {...form.register('deckId')}>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Loại thẻ
          <select {...form.register('noteType')}>
            <option value="Basic">Basic</option>
            <option value="BasicAndReverse">Basic và đảo chiều</option>
            <option value="Cloze">Cloze</option>
          </select>
        </label>
        <label>
          <span className="field-label">
            Mặt trước / nội dung{' '}
            <span className="required" aria-hidden="true">
              *
            </span>
          </span>
          <textarea aria-required="true" {...form.register('front')} />
        </label>
        <FormError message={form.formState.errors.front?.message} />
        <label>
          <span className="field-label">
            Mặt sau{' '}
            <span className="required" aria-hidden="true">
              *
            </span>
          </span>
          <textarea aria-required="true" {...form.register('back')} />
        </label>
        <FormError message={form.formState.errors.back?.message} />
        <label>
          Nhãn, cách nhau bằng dấu phẩy
          <input {...form.register('tags')} />
        </label>
        {submitError !== null && (
          <p className="form-error" role="alert">
            {submitError}
          </p>
        )}
        <div className="actions">
          <button disabled={save.isPending} aria-busy={save.isPending}>
            <ButtonContent loading={save.isPending}>
              {save.isPending ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Lưu và tạo thẻ'}
            </ButtonContent>
          </button>
          <button type="button" className="secondary" onClick={done}>
            Hủy
          </button>
        </div>
      </form>
    </section>
  );
}

export function NotesPage() {
  const client = useQueryClient();
  const [editing, setEditing] = useState<Note | null | undefined>(undefined);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ExcelImportResult | null>(null);
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ExcelImportPreview | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const fileInput = useRef<HTMLInputElement>(null);
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api.get<Deck[]>('/decks') });
  const activeDeckId = selectedDeckId || decks.data?.[0]?.id || '';
  const notes = useQuery({
    queryKey: ['notes', activeDeckId],
    queryFn: () => api.get<Note[]>(`/notes?deckId=${encodeURIComponent(activeDeckId)}`),
    enabled: activeDeckId !== '',
    staleTime: 30_000
  });
  const filteredNotes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi-VN');
    if (query === '') return notes.data ?? [];
    return (notes.data ?? []).filter((note) =>
      `${note.fieldsJson} ${note.tagsJson} ${note.noteType}`
        .toLocaleLowerCase('vi-VN')
        .includes(query)
    );
  }, [notes.data, search]);
  const pageCount = Math.max(1, Math.ceil(filteredNotes.length / notesPerPage));
  const currentPage = Math.min(page, pageCount);
  const visibleNotes = filteredNotes.slice(
    (currentPage - 1) * notesPerPage,
    currentPage * notesPerPage
  );
  useEffect(() => setPage(1), [activeDeckId, search]);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/notes/${id}`),
    onSuccess: () => {
      setRemoveError(null);
      void client.invalidateQueries({ queryKey: ['notes'] });
    },
    onError: (error) => setRemoveError(errorMessage(error))
  });
  const importExcel = useMutation({
    mutationFn: ({ deckId, file }: { deckId: string; file: File }) => {
      const data = new FormData();
      data.append('file', file);
      return api.postForm<ExcelImportResult>(`/decks/${deckId}/import-excel`, data);
    },
    onSuccess: (result) => {
      setImportError(null);
      setImportResult(result);
      void client.invalidateQueries({ queryKey: ['notes'] });
    },
    onError: (error) => setImportError(errorMessage(error))
  });
  const previewExcel = useMutation({
    mutationFn: ({ deckId, file }: { deckId: string; file: File }) => {
      const data = new FormData();
      data.append('file', file);
      return api.postForm<ExcelImportPreview>(`/decks/${deckId}/import-excel/preview`, data);
    },
    onSuccess: (preview) => {
      setImportError(null);
      setImportPreview(preview);
    }
  });
  const undoImport = useMutation({
    mutationFn: (deckId: string) =>
      api.post<{ undoneNotes: number }>(`/decks/${deckId}/import-excel/undo`, {}),
    onSuccess: () => {
      setImportResult(null);
      setImportPreview(null);
      void client.invalidateQueries({ queryKey: ['notes'] });
    },
    onError: (error) => setImportError(errorMessage(error))
  });
  const done = () => {
    setEditing(undefined);
    void client.invalidateQueries({ queryKey: ['notes'] });
  };
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Nội dung học</p>
          <h1>Thẻ</h1>
          <p className="muted">
            {notes.data === undefined ? 'Đang tải số lượng…' : `${notes.data.length} thẻ`}
          </p>
        </div>
        <div className="page-actions">
          <label className="import-deck">
            <span className="sr-only">Bộ thẻ đang xem</span>
            <select
              aria-label="Bộ thẻ đang xem"
              disabled={decks.isLoading || !decks.data?.length || importExcel.isPending}
              value={activeDeckId}
              onChange={(event) => setSelectedDeckId(event.target.value)}
            >
              {decks.data?.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={decks.isLoading || !decks.data?.length}
            onClick={() => setEditing(null)}
          >
            Tạo thẻ
          </button>
        </div>
      </header>

      <div className="notes-toolbar">
        <label className="search-field">
          <span className="sr-only">Tìm trong thẻ</span>
          <input
            type="search"
            placeholder="Tìm mặt trước, mặt sau hoặc nhãn"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <details className="import-tools">
          <summary>Nhập từ Excel</summary>
          <div className="import-tools-body">
            <input
              ref={fileInput}
              className="sr-only"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file !== undefined && activeDeckId) {
                  setImportFile(file);
                  previewExcel.mutate({ deckId: activeDeckId, file });
                }
              }}
            />
            <div className="actions">
              <button
                type="button"
                className="secondary"
                disabled={decks.isLoading || !decks.data?.length || previewExcel.isPending}
                onClick={() => fileInput.current?.click()}
              >
                <ButtonContent loading={previewExcel.isPending}>
                  {previewExcel.isPending ? 'Đang đọc tệp…' : 'Chọn Excel'}
                </ButtonContent>
              </button>
              {importPreview !== null && importFile !== null && (
                <button
                  type="button"
                  disabled={importExcel.isPending}
                  onClick={() => importExcel.mutate({ deckId: activeDeckId, file: importFile })}
                >
                  Xác nhận import
                </button>
              )}
              <button
                type="button"
                className="secondary"
                disabled={undoImport.isPending || !activeDeckId}
                onClick={() => undoImport.mutate(activeDeckId)}
              >
                Hoàn tác import gần nhất
              </button>
            </div>
            <p className="muted import-help">
              Hỗ trợ Front, Back, Tags và Type trên mọi worksheet. Ứng dụng tự nhận diện nhiều bảng;
              các cột STT, trạng thái, ghi chú và tần suất sẽ được bỏ qua.
            </p>
          </div>
        </details>
      </div>

      {importResult !== null && (
        <div className="import-result" role="status">
          <p>
            Đã tạo {importResult.importedNotes} thẻ và {importResult.createdCards} thẻ ôn tập.
            {` Đã nhận diện ${importResult.recognizedBlocks} bảng và duyệt ${importResult.scannedRows} dòng.`}
            {importResult.skippedRows > 0
              ? ` Bỏ qua ${importResult.skippedRows} dòng không hợp lệ.`
              : ''}
          </p>
          {importResult.errors.length > 0 && (
            <ul>
              {importResult.errors.slice(0, 3).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {importPreview !== null && (
        <div className="import-result">
          <p>
            Xem trước: {importPreview.validRows} dòng hợp lệ, {importPreview.skippedRows} dòng lỗi.
          </p>
          <ul>
            {importPreview.rows.slice(0, 5).map((row, index) => (
              <li key={`${row.front}-${index}`}>
                {row.front} → {row.back}
              </li>
            ))}
          </ul>
        </div>
      )}
      {importError !== null && (
        <p className="form-error" role="alert">
          {importError}
        </p>
      )}
      {!decks.isLoading && decks.data?.length === 0 && (
        <EmptyState
          title="Bạn cần một bộ thẻ trước"
          description="Tạo bộ thẻ để bắt đầu thêm thẻ học."
          action={
            <Link className="button" to="/decks">
              Tạo bộ thẻ
            </Link>
          }
        />
      )}
      {editing !== undefined && <NoteEditor decks={decks.data ?? []} note={editing} done={done} />}
      {removeError !== null && (
        <p className="form-error" role="alert">
          {removeError}
        </p>
      )}

      {notes.isLoading ? (
        <ListSkeleton />
      ) : notes.isError ? (
        <QueryError title="Không thể tải danh sách thẻ." onRetry={() => void notes.refetch()} />
      ) : notes.data?.length === 0 ? (
        <EmptyState
          title="Bạn chưa có thẻ nào"
          description="Thêm thẻ để bắt đầu ôn tập với bộ thẻ của bạn."
          action={
            decks.data?.length ? (
              <button onClick={() => setEditing(null)}>Tạo thẻ</button>
            ) : undefined
          }
        />
      ) : filteredNotes.length === 0 ? (
        <EmptyState
          title="Không tìm thấy thẻ"
          description="Thử từ khóa ngắn hơn hoặc kiểm tra lại bộ thẻ đang xem."
          action={
            <button className="secondary" onClick={() => setSearch('')}>
              Xóa tìm kiếm
            </button>
          }
        />
      ) : (
        <>
          <div className="card-list notes-card-list">
            {visibleNotes.map((note) => {
              const fields = parseJson<Record<string, string>>(note.fieldsJson, {});
              const tags = parseJson<string[]>(note.tagsJson, []);
              return (
                <article className="card" key={note.id}>
                  <div>
                    <h2>{fields.front ?? fields.text ?? 'Thẻ'}</h2>
                    <p>{fields.back ?? ''}</p>
                    <small>{note.noteType}</small>
                    {tags.length > 0 && (
                      <div className="tag-list" aria-label="Nhãn">
                        {tags.map((tag) => (
                          <span className="tag" key={tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="actions">
                    <button className="secondary" onClick={() => setEditing(note)}>
                      Sửa
                    </button>
                    <button
                      className="danger"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm('Xóa mềm thẻ này?')) remove.mutate(note.id);
                      }}
                    >
                      Xóa
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <nav className="notes-pagination" aria-label="Phân trang thẻ">
            <button
              className="secondary"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Trang trước
            </button>
            <span>
              Trang {currentPage}/{pageCount} · {filteredNotes.length} kết quả
            </span>
            <button
              className="secondary"
              disabled={currentPage === pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            >
              Trang sau
            </button>
          </nav>
        </>
      )}
    </>
  );
}
