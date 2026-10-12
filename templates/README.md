# Hướng dẫn sử dụng `templates/`

Thư mục này chứa các **template quảng cáo** dùng cho tính năng: user chọn 1 video mẫu có sẵn → upload ảnh sản phẩm của họ → hệ thống tự sinh ra ảnh quảng cáo, rồi sinh video quảng cáo, với sản phẩm của user thay cho sản phẩm gốc trong template.

## 1. Tổng quan luồng xử lý

```
templates/<id>/source.mp4   (video mẫu, cho user XEM để chọn template)
         │
templates/<id>/base.png     (1 khung hình được chọn sẵn từ source.mp4, dùng làm ảnh nền)
         │
         ▼  (user upload ảnh sản phẩm của họ)
┌─────────────────────────────────────────────┐
│ BƯỚC 1 — SINH ẢNH                            │
│ model: accessory_flux_lab                    │
│ input: base.png (ảnh 1) + ảnh user (ảnh 2)   │
│        + template.json → image_prompt        │
│ output: 1 ảnh preview (sản phẩm user đã       │
│         được ghép vào đúng bối cảnh template) │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ BƯỚC 2 — SINH VIDEO                          │
│ model: image_to_video_wan22                  │
│ input: ảnh preview (bước 1)                   │
│        + template.json → effect_prompt        │
│        + template.json → params               │
│ output: video quảng cáo hoàn chỉnh            │
└─────────────────────────────────────────────┘
```

Mỗi template là 1 thư mục con `templates/<template_id>/`, gồm 3 file:

| File | Vai trò |
|---|---|
| `source.mp4` | Video mẫu gốc — cho user xem/preview để chọn template (không đưa vào model nào cả) |
| `base.png` | 1 khung hình cụ thể trích từ `source.mp4`, dùng làm "ảnh 1" đưa vào bước sinh ảnh |
| `template.json` | Cấu hình: 2 prompt + tham số sinh video (chi tiết bên dưới) |

Ngoài ra có `templates/_shared.json` — **chỉ là tài liệu/ghi chú lịch sử**, không có bước nào trong luồng xử lý đọc hay ghép nội dung của file này vào nữa (xem mục 5).

---

## 2. Bước 1 — Sinh ảnh preview (model `accessory_flux_lab`)

Gọi tới backend Colab đang chạy notebook `AccessoryFluxLab_Colab.ipynb`:

```
POST {IMAGE_SERVER}/generate/accessory_flux_lab
Content-Type: application/json

{
  "anh_nguoi_url": "<url của base.png>",       // HOẶC anh_nguoi_base64
  "anh_phu_kien_url": "<url ảnh sản phẩm user>", // HOẶC anh_phu_kien_base64
  "prompt": "<template.json → image_prompt>",
  "dan_lai": false
}
```

- `anh_nguoi_*` = ảnh nền (`base.png`) — đóng vai trò **"image 1"** trong prompt.
- `anh_phu_kien_*` = ảnh sản phẩm user vừa upload — đóng vai trò **"image 2"**.
- `dan_lai` **PHẢI luôn là `false`**. Tham số này mặc định `true` ở server (thiết kế cho ca ghép phụ kiện nhỏ như kính/mũ lên người — giữ nguyên pixel vùng "ít thay đổi"); với use case thay nguyên cả sản phẩm, để mặc định sẽ làm sản phẩm cũ "hiện lại" một phần trong kết quả.

**Response ngay lập tức** (job chưa chạy xong):
```json
{ "job_id": "...", "status": "processing", "result_url": "/jobs/{job_id}/result" }
```

Poll `GET {IMAGE_SERVER}/jobs/{job_id}` tới khi `status` khác `"processing"`, rồi tải ảnh kết quả qua `GET {IMAGE_SERVER}/jobs/{job_id}/result` — đây chính là **"ảnh preview"**.

---

## 3. Bước 2 — Sinh video (model `image_to_video_wan22`)

Gọi tới backend Colab đang chạy notebook `ImageToVideo_Wan22_Colab.ipynb`:

```
POST {VIDEO_SERVER}/generate/image_to_video_wan22
Content-Type: application/json

{
  "anh_url": "<url ảnh preview từ bước 1>",   // HOẶC anh_base64
  "chuyen_dong": "<template.json → effect_prompt>",
  "so_frame": <template.json → params.so_frame>,
  "fps": <params.fps>,
  "steps": <params.steps>,
  "buoc_cao": <params.buoc_cao>,
  "guidance": <params.guidance>,
  "lora": <params.lora>
}
```

- `anh_url`/`anh_base64` = chính ảnh preview sinh ra ở bước 1 (không phải `base.png`).
- `chuyen_dong` = **gửi thẳng `effect_prompt`, không ghép thêm gì** (xem mục 5 — quyết định mới nhất, đã bỏ hẳn việc nối câu "giữ nguyên sản phẩm" vào đây).
- Các tham số còn lại lấy nguyên từ `template.json → params`.

Cũng poll `GET {VIDEO_SERVER}/jobs/{job_id}` rồi tải video qua `GET {VIDEO_SERVER}/jobs/{job_id}/result`.

> Lưu ý: 2 bước dùng **2 backend Colab khác nhau** (2 URL khác nhau, có thể là 2 GPU khác nhau). Mỗi backend chỉ xử lý 1 job tại 1 thời điểm (serialize theo GPU) — nếu cần tốc độ, chạy nhiều template song song bằng cách dùng nhiều phiên Colab khác nhau cho cùng 1 loại backend.

---

## 4. Các trường quan trọng trong `template.json`

```json
{
  "template_id": "dome-product",
  "source_video_url": "https://...",          // URL gốc đã tải source.mp4 về
  "source_video_local": "templates/dome-product/source.mp4",
  "video_info": { "width": 720, "height": 1280, "fps": 24, "nb_frames": 128, "duration_s": 5.33 },

  "frame_image": "templates/dome-product/base.png",
  "frame_image_note": "...",                  // ghi chú vì sao chọn đúng khung này

  "image_prompt": "...",                      // prompt cho BƯỚC 1 (sinh ảnh)
  "image_prompt_note": "...",                 // ghi chú cách viết/lý do

  "effect_prompt": "...",                     // prompt cho BƯỚC 2 (sinh video)
  "effect_prompt_note": "...",                // ghi chú cách viết/lý do

  "params": {
    "so_frame": 65, "fps": 16, "steps": 4,
    "buoc_cao": 2, "guidance": 1.0, "lora": "t2v"
  },
  "status": "da_duyet"                        // "cho_test" | "da_duyet"
}
```

### `image_prompt` — prompt cho bước sinh ảnh
Mô tả cảnh **kết quả cuối cùng** như đang tường thuật lại 1 bức ảnh có sẵn, **không viết dạng câu lệnh** ("Replace X with Y") và **không mô tả chi tiết sản phẩm cũ**. Cấu trúc khuyến nghị (xem `_shared.json → image_prompt_skeleton`):

> "A [khung cảnh/vật chứa] holds the single product from image 2, [tư thế cụ thể], in the spot where the [vật cũ, 1-2 từ] was. [Mô tả tiếp xúc vật lý: đặt ở đâu, bóng đổ thế nào]. The product is about the same size as the [vật cũ] and fills the same [không gian]. The product keeps the exact shape, proportions, colors, materials, logo and all printed text of image 2. [Mô tả ánh sáng/phản chiếu/khói/nước THỰC SỰ chạm vào sản phẩm mới]. The [các phần nền cần giữ] stay the same as image 1."

Vật cũ chỉ nhắc **1 lần duy nhất, ngắn gọn**, chỉ để làm mốc vị trí/kích thước — không mô tả hình dạng/chất liệu của nó.

### `effect_prompt` — prompt cho bước sinh video
Mô tả **chỉ chuyển động của cảnh/nền/camera**, không nhắc gì đến hình dạng/màu sắc sản phẩm (vì sản phẩm thay đổi theo từng user). Bắt buộc chỉ mô tả chuyển động **có thật** trong `source.mp4` (xem lại video gốc kỹ trước khi viết) — mô tả chuyển động không có thật ("kịch tính hóa") thường khiến model bỏ qua, không render ra được.

### `params`
Tham số kỹ thuật gửi kèm cho model sinh video — copy nguyên từ `template.json`, không cần hiểu sâu để tích hợp (chỉ cần truyền đúng).

---

## 5. `templates/_shared.json`

**Không bắt buộc đọc file này để tích hợp.** Đã xác nhận thực nghiệm: bỏ hẳn file này ra khỏi luồng gọi (không đọc, không ghép gì từ nó), `image_prompt`/`effect_prompt` sẵn có trong từng `template.json` vẫn sinh ảnh/video đúng — vì mỗi `template.json` đã tự chứa đầy đủ nội dung cần thiết, không phụ thuộc field nào bên ngoài. Trước đây từng có 1 trường (`preserve_product_clause`) được code nối thêm vào `chuyen_dong`, và 1 ô nhập tương ứng trong `cong-cu/tao_video_san_pham.html`; cả hai đã được gỡ bỏ (2026-10) sau khi xác nhận không cần thiết.

File này giờ chỉ còn là nhật ký/ghi chú lịch sử cho người viết/sửa `image_prompt`/`effect_prompt` của từng template, để không lặp lại các lỗi đã từng gặp — đọc khi cần tham khảo cách viết prompt, không phải phần bắt buộc của hệ thống:

- `image_prompt_skeleton` — cấu trúc mẫu cho `image_prompt` (xem mục 4).
- `note_prompt_phai_viet_tich_cuc` — lịch sử các lần thử sai cách viết `image_prompt` và bài học rút ra.
- `note_dan_lai_phai_tat` — lý do `dan_lai` luôn phải là `false`.
- `note_base_frame_tim_qua_wipe` — nhiều `source.mp4` có hiệu ứng quét sáng ở đầu video; `base.png` phải lấy ở khung SAU khi hiệu ứng đó kết thúc.
- `note_cfg1_negative_prompt_vo_dung` — vì tham số `guidance` (cfg) = 1.0, trường `negative_prompt` của model sinh video **hoàn toàn không có tác dụng**. Mọi yêu cầu phải nằm trong `chuyen_dong` (prompt dương), không gửi `negative_prompt` kỳ vọng nó lọc được gì.
- `preserve_product_clause` + `preserve_product_clause_status` — **đã NGỪNG sử dụng** (quyết định 2026-10). Trước đây có quy ước nối thêm câu "giữ nguyên sản phẩm" vào cuối `effect_prompt` trước khi gửi `chuyen_dong`; qua thực nghiệm (nhiều lần sinh video không có câu này vẫn giữ đúng hình sản phẩm) đã quyết định **bỏ hẳn bước nối này** — backend chỉ cần gửi thẳng `effect_prompt`, không ghép thêm gì. Đọc kỹ `preserve_product_clause_status` nếu cần biết chi tiết/rủi ro của quyết định này.

---

## 6. Kiểm tra backend còn sống trước khi gọi

Cả 2 loại backend (ảnh, video) đều có endpoint:

```
GET {SERVER}/health
```
Trả về `models_ready: true` nghĩa là sẵn sàng nhận job. `{SERVER}` là URL dạng `https://xxx.trycloudflare.com` do phiên Colab đang chạy cấp phát — **đổi mỗi lần phiên Colab khởi động lại**, cần cấu hình runtime, không hard-code.
