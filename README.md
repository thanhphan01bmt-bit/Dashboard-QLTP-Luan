# Dashboard doanh thu KV QLTP Luân (bản Vercel)

Trang dashboard có đăng nhập. Mỗi người dùng một tài khoản riêng, chia 3 quyền:

| Quyền | Được làm gì |
|---|---|
| **Quản trị** | Xem, tải file cập nhật số liệu, đặt % mục tiêu tăng trưởng, quản lý tài khoản, tải bản sao lưu |
| **Cập nhật dữ liệu** | Xem, tải file Excel lên và lưu số liệu mới |
| **Chỉ xem** | Chỉ xem số liệu siêu thị được gán (Quản lý tài khoản → cột "Siêu thị được xem") và Bảng thi đua Quản lý. Gán "Toàn khu vực" để xem cả khu vực. Chưa gán thì tự khớp tên đăng nhập với mã user QL của siêu thị, không khớp thì không vào được |

Số liệu và danh sách tài khoản lưu trong **Vercel Blob (Private)**. Chưa đăng nhập thì không đọc được số liệu.

---

## Cài đặt lần đầu (khoảng 20 phút)

### Bước 1. Đưa mã nguồn lên GitHub
1. Vào github.com → **New repository** → đặt tên, ví dụ `kv-qltp-dashboard` → chọn **Private** → **Create repository**.
2. Trong repo vừa tạo, bấm **uploading an existing file**. Kéo thả **toàn bộ nội dung bên trong** thư mục `kv-qltp-dashboard` (gồm `api`, `public`, `scripts`, `package.json`, `vercel.json`, `README.md`) vào, rồi bấm **Commit changes**.
   - Không đưa file `du_lieu_ban_dau.json` lên GitHub.

### Bước 2. Tạo dự án trên Vercel
1. Vào vercel.com → **Sign Up / Log in with GitHub**.
2. **Add New… → Project** → chọn repo `kv-qltp-dashboard` → **Import**.
3. **Framework Preset**: để **Other**. Không cần sửa Build Command hay Output Directory.
4. Mở mục **Environment Variables**, thêm 4 biến:

| Name | Value |
|---|---|
| `ADMIN_USER` | tên đăng nhập quản trị chính, ví dụ `luan` |
| `ADMIN_PASSWORD` | mật khẩu quản trị chính (đặt mạnh, không dùng lại mật khẩu khác) |
| `ADMIN_NAME` | tên hiển thị, ví dụ `Thành Luân` |
| `SESSION_SECRET` | một chuỗi ngẫu nhiên dài ít nhất 32 ký tự, ví dụ gõ bừa chữ và số. Không cần nhớ, không chia sẻ cho ai |

5. Bấm **Deploy**, chờ xong.

### Bước 3. Tạo kho lưu trữ Blob (Private)
1. Trong dự án trên Vercel, mở tab **Storage** → **Create Database / Create Storage** → chọn **Blob** → **Continue**.
2. Ở phần quyền truy cập chọn **Private** → đặt tên (ví dụ `kv-qltp-data`) → **Create**.
3. Khi được hỏi kết nối với dự án, chọn dự án `kv-qltp-dashboard`, tick đủ **Production, Preview, Development** → **Connect**.
4. Mở tab **Deployments** → bấm **⋯** ở bản mới nhất → **Redeploy** → **Redeploy** (để dự án nhận kho vừa tạo).
5. Kiểm tra: **Settings → Environment Variables** phải có `BLOB_STORE_ID` hoặc `BLOB_READ_WRITE_TOKEN`.

> **Nếu trang báo "No blob credentials found" hoặc "Chưa kết nối được kho lưu trữ Blob":**
> 1. Vào **Storage** → bấm vào kho Blob → xem đã **Connect** với dự án chưa (mục Projects). Chưa thì bấm **Connect Project**.
> 2. Nếu vẫn lỗi: trong trang kho Blob, tìm đoạn `.env.local` (mục Quickstart / Settings) có dòng `BLOB_READ_WRITE_TOKEN=...`, copy giá trị đó. Vào dự án → **Settings → Environment Variables** → thêm biến `BLOB_READ_WRITE_TOKEN` với giá trị vừa copy.
> 3. **Redeploy** lại (tab Deployments → ⋯ → Redeploy). Biến môi trường chỉ có hiệu lực sau khi Redeploy.

### Bước 4. Nạp số liệu hiện có
1. Mở địa chỉ trang (dạng `https://kv-qltp-dashboard-xxxx.vercel.app`, xem ở tab **Overview** → **Domains**).
2. Đăng nhập bằng `ADMIN_USER` / `ADMIN_PASSWORD`.
3. Trang báo "Chưa có dữ liệu" → chọn file **`du_lieu_ban_dau.json`** (Claude gửi kèm) → dashboard hiện lên với toàn bộ số liệu hiện tại.

### Bước 5. Tạo tài khoản cho mọi người
Bấm **Quản lý tài khoản** ở góc trên → điền tên đăng nhập, tên hiển thị, quyền, mật khẩu → **Thêm tài khoản**. Gửi tên đăng nhập + mật khẩu cho từng người, nhắc họ bấm **Đổi mật khẩu** sau lần đăng nhập đầu.

---

## Dùng hằng ngày
- Người có quyền **Quản trị** hoặc **Cập nhật dữ liệu**: bấm **Tải file lên** → chọn các file Excel lũy kế từ đầu tháng → **Xem trước dashboard** → **Lưu và cập nhật cho mọi người**.
- Nếu 2 người lưu gần như cùng lúc, trang sẽ hỏi trước khi ghi đè.
- Chỉ quản trị đổi được % mục tiêu tăng trưởng (tab Mục tiêu ngày).

## Sao lưu
- Mỗi lần lưu, hệ thống tự giữ 1 bản sao lưu cho từng ngày trong kho Blob (thư mục `backup/`).
- Quản trị có nút **Tải bản sao lưu** để giữ một bản trên máy. Khi cần khôi phục: **Tải file lên** → chọn file `.json` đó → **Lưu**.

## Quên mật khẩu
- Người dùng thường: quản trị vào **Quản lý tài khoản** → **Đặt lại mật khẩu**.
- Quản trị chính: sửa biến `ADMIN_PASSWORD` trong Vercel (**Settings → Environment Variables**) rồi **Redeploy**.

## Chi phí
- Gói Vercel **Hobby** miễn phí chỉ dành cho dự án cá nhân, không thương mại. Dùng cho công việc công ty nên chuyển gói **Pro** (khoảng 20 USD/tháng cho 1 người quản lý dự án trên Vercel). Tài khoản đăng nhập vào dashboard không tính phí.
- Kho Blob: số liệu khoảng 0,6 MB, sao lưu mỗi ngày 1 bản, rất nhỏ so với hạn mức.

## Cấu trúc mã
- `public/index.html`: giao diện (đăng nhập + dashboard, đọc file Excel ngay trên trình duyệt).
- `api/login.js`, `logout.js`, `me.js`, `password.js`: đăng nhập, phiên, đổi mật khẩu.
- `api/users.js`: quản lý tài khoản (chỉ quản trị).
- `api/data.js`: đọc / lưu số liệu.
- `api/_lib/`: mã dùng chung (mã hóa mật khẩu scrypt, cookie phiên ký HMAC, đọc/ghi Blob).
- `scripts/dev-server.mjs`: chạy thử trên máy, không dùng khi chạy trên Vercel.

## Thông báo tự động (cần gói Pro)

Lịch trong `vercel.json` (giờ UTC): 7h00 mục tiêu hôm nay · 22h00 tổng kết ngày · thứ Hai 8h00 tổng kết tuần · ngày 1 lúc 8h00 chốt tháng (giờ Việt Nam).
Cần thêm biến môi trường `CRON_SECRET` (chuỗi ngẫu nhiên ≥ 16 ký tự) rồi Redeploy. Quản trị bật/tắt, xem trước và gửi thử trong Menu → Thông báo tự động.
Gói Hobby chỉ cho tối đa 12 hàm trong thư mục `api` (file bắt đầu bằng `_` không tính); hiện có 10.
Quản trị / cập nhật dữ liệu nhận số liệu toàn khu vực; tài khoản chỉ xem nhận số liệu siêu thị của mình.
