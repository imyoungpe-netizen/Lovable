import { useState } from "react";
import { Search, Users } from "lucide-react";
import {
  getGetDarkAceAdminUsersQueryKey,
  useGetDarkAceAdminUsers,
} from "@workspace/api-client-react";
import AdminPlayerTimeline from "./AdminPlayerTimeline";
import "./AdminJournalPlayerHistory.css";

export default function AdminJournalPlayerHistory() {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ id: string; displayName: string; username?: string | null } | null>(null);
  const normalizedSearch = search.trim();
  const params = { search: normalizedSearch || undefined, limit: 25 };
  const users = useGetDarkAceAdminUsers(params, {
    query: {
      queryKey: getGetDarkAceAdminUsersQueryKey(params),
      enabled: normalizedSearch.length > 0,
    },
  });

  return <div className="admin-journal-player-history">
    <section className="admin-users panel rounded-2xl admin-journal-player-picker">
      <div className="section-label"><h2><Users size={16} /> Хронология игрока</h2><span className="eyebrow">ПОИСК ПО ID ИЛИ ИМЕНИ</span></div>
      <p className="admin-users-note">Найдите игрока, чтобы увидеть игровые результаты, операции с балансом, промокоды, подарки и заявки в одной ленте.</p>
      <label className="admin-search-label" htmlFor="admin-journal-player-search">Поиск игрока</label>
      <div className="admin-journal-search-wrap">
        <Search size={15} aria-hidden="true" />
        <input id="admin-journal-player-search" className="admin-search-input" value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setSelectedUser(null);
          }}
          placeholder="Например, 123456789 или @username" autoComplete="off" data-testid="input-admin-journal-player-search" />
      </div>
      <div className="admin-user-list" aria-live="polite">
        {!normalizedSearch ? <div className="admin-user-empty">Введите Telegram ID, имя или username игрока.</div>
          : users.isLoading ? <div className="admin-user-empty">Ищем игрока…</div>
            : users.isError ? <div className="admin-user-empty admin-journal-search-error" role="alert">
              Не удалось найти игрока. <button type="button" onClick={() => void users.refetch()}>Повторить</button>
            </div>
              : users.data?.users.length
                ? users.data.users.map((user) => <button type="button" key={user.id}
                  className={`admin-user-option ${selectedUser?.id === user.id ? "admin-user-selected" : ""}`}
                  onClick={() => setSelectedUser({ id: user.id, displayName: user.displayName, username: user.username })}
                  aria-pressed={selectedUser?.id === user.id} data-testid={`button-journal-player-${user.id}`}>
                  <span className="admin-user-option-main"><b>{user.displayName}</b><code>{user.id}</code></span>
                  <span className="admin-user-option-meta">{user.username ? `@${user.username}` : "Telegram ID"}</span>
                </button>)
                : <div className="admin-user-empty">Игрок не найден. Попробуйте поискать по Telegram ID или username.</div>}
      </div>
    </section>

    {selectedUser && <div className="admin-journal-selected-player">
      <div className="admin-journal-selected-heading">
        <span className="eyebrow">ВЫБРАННЫЙ ИГРОК</span>
        <b>{selectedUser.displayName}</b>
        <code>{selectedUser.username ? `@${selectedUser.username}` : selectedUser.id}</code>
      </div>
      <AdminPlayerTimeline key={selectedUser.id} userId={selectedUser.id} />
    </div>}
  </div>;
}
