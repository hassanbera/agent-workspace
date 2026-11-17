# Agent Workspace

Windows üzerinde çalışan kişisel geliştirme paneli. Mevcut Git repolarını aç, değişiklikleri izle, ajan çalıştır ve servis loglarını takip et.

## Başlat

Node.js 22.12+ ve Git gerekir. Kullanacağın ajan CLI'larını ayrıca kur ve kendi hesaplarıyla giriş yap.

```powershell
npm ci
npm run build
npm start
```

Tarayıcıda [127.0.0.1:4789](http://127.0.0.1:4789/) adresini aç. Bir Git repo klasörü ekle.

Sol menüdeki **Renk paleti** üzerinden varsayılan Stüdyo / Limon ve diğer paletler arasında geçiş yap. Seçim tarayıcıda saklanır. Ajan simgeleri [Lobe Icons](https://github.com/lobehub/lobe-icons) paketinden gelir.

Arayüz Next.js App Router, Tailwind CSS ve shadcn/ui bileşenleriyle yazıldı. `npm run build` statik arayüzü hazırlar. Yerel Node.js servisi bu arayüzü ve proje API’sini aynı adreste sunar.

- **Değişiklikler:** Canlı Git durumu, dosya diff'i, dosya bazında stage ve unstage, commit geçmişi, commit ve push. Yeni bir branch için ayrı worktree açabilirsin.
- **Ajanlar:** Yerel Codex, Claude Code ve Cursor CLI başlatıcıları. Ortak talimatlar için repo kökündeki `AGENTS.md` kullanılır. Önceki çalışma seçilirse görev metni, güncel Git durumu ve desteklenen son yanıt yeni komuta eklenir. Devir notunu düzenleyebilirsin.
- **Servisler:** Her servis için klasör ve başlatma komutu kaydet. Workspace çalıştırdığın sürecin durumunu ve çıktısını gösterir.
- **Yetenekler:** Projede mevcut skill dosyalarını gör veya seçtiğin ajan için yeni bir `SKILL.md` oluştur.
- **Bilgi arşivi:** Frontend şablonlarını, kütüphane tercihlerini, backend mimari ve test notlarını, hata çözümlerini ve tasarım referanslarını etiketle ve ara.
- **Bağlam ve planlar:** Proje kararlarını, güncel durumu ve planları ayrı kaydet. Plan durumunu güncelle ve önceki sürümleri aç. Ajan görevi başlatırken ilgili arşiv veya proje kayıtlarını seç.

Arşiv ve proje notları yerelde `notebook.json` dosyasına yazılır. Kayıt başına son 30 eski sürüm saklanır. Ajan görevine seçilen en fazla sekiz kayıt, toplam 12.000 karaktere kadar eklenir.

Yeni görevde en güncel proje bağlamı ve devam eden son plan varsayılan olarak seçilir. Ajan formunda bu seçimi kapatabilir veya arşivden başka kayıt ekleyebilirsin. Git ekranında ilk değişiklik otomatik açılır. **İncelet** diff inceleme görevini hazırlar, **Tümünü stage et** dosyaları tek adımda stage eder.

## Davranış ve kapsam

Codex çalışma klasörüne yazabilen sandbox ile başlatılır. Claude Code kendi izin ayarlarını kullanır. Cursor CLI bu sürümde Ask moduyla çalışır. Workspace, CLI oturumlarının izin sorularını yanıtlayan bir arayüz sağlamaz. Sürüm, giriş ve izin durumları CLI'a bağlıdır. Bir repoda aynı anda tek ajan çalıştırılır. Paralel yazma için ayrı worktree aç.

Proje ve servis ayarları Windows'ta `%LOCALAPPDATA%/AgentWorkspace` altında saklanır. Worktree'ler burada ayrı bir klasöre açılır. Çalışma kayıtları işlem belleğindedir ve servis yeniden başlatıldığında temizlenir. Workspace hiçbir görevi kendiliğinden commit veya push etmez.

İlk sürüm dosya bazında stage destekler. MCP ve eklenti kurulumu, diff bloğu bazında stage ve yerleşik CLI izin paneli sonraki sürüm kapsamındadır.
