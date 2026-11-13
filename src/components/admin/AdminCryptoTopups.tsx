import { apiUrl } from "@/lib/api-base";
import { useEffect, useState, type FormEvent } from "react";
import { Coins, LoaderCircle, Save, ShieldCheck } from "lucide-react";
import "./AdminCryptoTopups.css";

const networks = [
  { id: "usdt_ton", label: "USDT · TON", hint: "The Open Network" },
  { id: "usdt_tron", label: "USDT · TRON", hint: "TRC-20" },
  { id: "usdt_ethereum", label: "USDT · Ethereum", hint: "ERC-20" },
  { id: "usdt_bsc", label: "USDT · BNB Chain", hint: "BEP-20" },
  { id: "usdt_solana", label: "USDT · Solana", hint: "SPL" },
  { id: "usdt_polygon", label: "USDT · Polygon", hint: "Polygon PoS" },
] as const;

type NetworkId = typeof networks[number]["id"];
type Addresses = Record<NetworkId, string>;
type SettingsResponse = {
  schemaReady: boolean;
  depositProcessingEnabled: boolean;
  creditRubPerMillion: number;
  networkAddresses: Addresses;
  updatedAt: string | null;
};

const emptyAddresses = (): Addresses => Object.fromEntries(
  networks.map(({ id }) => [id, ""]),
) as Addresses;

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload = await response.json();
    return payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export default function AdminCryptoTopups() {
  const [addresses, setAddresses] = useState<Addresses>(emptyAddresses);
  const [creditRubPerMillion, setCreditRubPerMillion] = useState("300");
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [schemaReady, setSchemaReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    let mounted = true;
    void fetch(apiUrl("/api/dark-ace/admin/crypto-topup-settings"), { credentials: "include" })
      .then(async (response) => {
        const payload = await parseResponse(response);
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Не удалось загрузить настройки.");
        return payload as unknown as SettingsResponse;
      })
      .then((settings) => {
        if (!mounted) return;
        setSchemaReady(settings.schemaReady === true);
        setAddresses({ ...emptyAddresses(), ...(settings.networkAddresses ?? {}) });
        setCreditRubPerMillion(String(settings.creditRubPerMillion ?? 300));
        setDepositEnabled(settings.depositProcessingEnabled === true);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setNotice({
          text: error instanceof Error ? error.message : "Не удалось загрузить настройки криптопополнения.",
          error: true,
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !schemaReady) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch(apiUrl("/api/dark-ace/admin/crypto-topup-settings"), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          networkAddresses: addresses,
          creditRubPerMillion: Number(creditRubPerMillion),
          depositProcessingEnabled: depositEnabled,
        }),
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Не удалось сохранить адреса.");
      }
      const settings = payload as unknown as SettingsResponse;
      setSchemaReady(settings.schemaReady === true);
      setAddresses({ ...emptyAddresses(), ...(settings.networkAddresses ?? {}) });
      setCreditRubPerMillion(String(settings.creditRubPerMillion ?? 300));
      setDepositEnabled(settings.depositProcessingEnabled === true);
      setNotice({
        text: settings.depositProcessingEnabled ? "Настройки сохранены. Приём USDT включён." : "Настройки сохранены. Приём USDT выключен.",
        error: false,
      });
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : "Не удалось сохранить адреса. Повторите попытку.",
        error: true,
      });
    } finally {
      setSaving(false);
    }
  };

  return <section className="admin-crypto-topups panel rounded-2xl" aria-labelledby="admin-crypto-topups-title">
    <header className="admin-crypto-topups-heading">
      <span className="admin-crypto-topups-icon"><Coins size={17} aria-hidden="true" /></span>
      <div>
        <p className="eyebrow">ПОДГОТОВКА КРИПТОПОПОЛНЕНИЯ</p>
        <h2 id="admin-crypto-topups-title">Адреса для USDT</h2>
        <p>Укажите адреса и цену. Приём USDT включайте только после проверки настроек.</p>
      </div>
    </header>

    {!schemaReady && !loading && <p className="admin-crypto-topups-notice is-error" role="status">
      Сначала примените миграцию базы данных для настроек криптопополнения. До этого адреса нельзя сохранять.
    </p>}

    <form className="admin-crypto-topups-form" onSubmit={(event) => void save(event)}>
      <label className="admin-crypto-price-field">
        <span>Цена за 1 млн кредитов, ₽</span>
        <input
          type="number"
          min={1}
          max={100000}
          step={1}
          value={creditRubPerMillion}
          onChange={(event) => setCreditRubPerMillion(event.currentTarget.value)}
          disabled={loading || saving || !schemaReady}
        />
      </label>
      <div className="admin-crypto-network-grid">
        {networks.map((network) => <label className="admin-crypto-network-field" key={network.id}>
          <span><b>{network.label}</b><small>{network.hint}</small></span>
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={200}
            placeholder="Адрес кошелька"
            value={addresses[network.id]}
            onChange={(event) => setAddresses((current) => ({
              ...current,
              [network.id]: event.currentTarget.value,
            }))}
            disabled={loading || saving || !schemaReady}
            aria-label={`Адрес получения для ${network.label}`}
          />
        </label>)}
      </div>
      <div className="admin-crypto-topups-footer">
        <label className="admin-crypto-enable">
          <input
            type="checkbox"
            checked={depositEnabled}
            onChange={(event) => setDepositEnabled(event.currentTarget.checked)}
            disabled={loading || saving || !schemaReady}
          />
          <span><b>Принимать USDT</b><small>Подтверждение переводов остаётся ручным</small></span>
        </label>
        <button className="outline-button" type="submit" disabled={loading || saving || !schemaReady}>
          {saving ? <LoaderCircle size={14} className="admin-crypto-spinner" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
          {loading ? "Загружаем…" : saving ? "Сохраняем…" : "Сохранить настройки"}
        </button>
      </div>
      {notice && <p className={`admin-crypto-topups-notice${notice.error ? " is-error" : ""}`} role="status">{notice.text}</p>}
    </form>
  </section>;
}
