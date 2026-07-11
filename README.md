# WikiSearch — Final Project SEG301

Hệ thống tìm kiếm ngữ nghĩa trên Wikipedia: kết hợp Vector Search (ChromaDB + Semantic Chunking) và BM25 keyword search, hợp nhất kết quả bằng Asymmetric Weighted RRF.

---

## 1. Cài đặt môi trường và thư viện

```bash
python -m venv env
env\Scripts\activate
pip install -r requirements.txt
```

---

## 2. Hai bộ dữ liệu (Data Profile)

Hệ thống có **2 bộ dữ liệu độc lập**, tùy chỉnh ở `DATA_PROFILE` -> mục đích: 1 bộ để đánh giá và 1 bộ để chạy chính :

| Profile | Dùng cho | Dataset | Vector DB |
|---|---|---|---|
| `prod` (mặc định) | Hệ thống chính | `data/raw/wiki_crawler_dataset.jsonl` | `data/vector/` |
| `eval` | Đánh giá mô hình | `data/eval/raw/wiki_crawler_dataset.json` | `data/eval/vector/` |


---

## 3. Chuẩn bị dữ liệu

### Cách 1 - Tải dữ liệu có sẵn

Tải toàn bộ thư mục `data/` tại đây và đặt vào gốc project:

`https://drive.google.com/drive/folders/1XXxsdiq8Z5xtVhfn3lMfn0Ymg8o4FHq4?usp=sharing`

### Cách 2 - Tự crawl + embedding

Chạy lệnh bên dưới ở terminal(địa chỉ tại thư mục gốc):

```bash
run_pipeline.bat
```

Nhiệm vụ của file:
1. Scrapy sẽ crawl wikipedia đến khi đạt khoảng **50.000** bài viết-phần lớn là các kiến thức liên quan về AI (nếu chưa chạm mốc 50k bài mà đã hết bài viết thì sẽ tạm dừng tại đó)  -> `data/raw/wiki_crawler_dataset.jsonl`
2. Semantic chunking + vector embedding -> `data/vector/`

**Lưu ý:**
- Tổng thời gian thực hiện(Ryzen 7 7840H + RTX4060 + Ram 16gb) **Khoảng gần 34h10m** (crawl và xử lí duplicate khoảng 11h30m, embedding khoảng 26h40m).
- Theo dõi tiến độ qua 2 file: `pipeline_status.txt` (nhật kí từng mốc) và `crawl_log.txt` (log crawl của scrapy) - có trong link drive đã gửi bên trên.
- Crawl bị ngắt giữa chừng như mất điện hoặc lỡ nhấn Ctrl+C chỉ cần chạy lại `run_pipeline.bat` là hệ thống sẽ tiếp tục bắt đầu từ chỗ vừa ngắt, không bị mất dữ liệu.
- Nếu muốn crawl lại từ đầu xóa cả 2 thứ trước khi chạy - file `data\raw\wiki_crawler_dataset.jsonl` và thư mục `wiki_bot\crawls\wiki50k`.

### Cách 3 — Chạy thủ công từng bước

```bash
cd wiki_bot
scrapy crawl wiki_spider
cd ..
python -m src.indexing.build_vector_db
```

---

## 4. Chạy hệ thống chính

```bash
uvicorn src.backend.main:app --reload
```

Backend khởi động mất khoảng **3-6p** (nạp model + BM25 index).

| Địa chỉ | Chức năng |
|---|---|
| `http://127.0.0.1:8000` | Giao diện tìm kiếm - có thể thực hiện tại đây |
| `http://127.0.0.1:8000/docs` |  test qua giao diện API(Swagger UI) |


### Cách dùng trên Swagger UI (`/docs`)
1. Chọn mục **GET /search**
2. Nhấn **Try it out**
3. Nhập câu truy vấn vào ô `q` (ví dụ: *"How does gradient descent work?"*)
4. (Tuỳ chọn) chỉnh `k` = số bài viết trả về (1–20, mặc định 5)
5. Nhấn **Execute** - kết quả hiển thị trong hộp Response

---

## 5. Đánh giá hệ thống

Đánh giá chạy trên **bộ dữ liệu eval riêng** (profile `eval`) với 22 truy vấn ground-truth, đo 2 metrics **Precision@K(K=10), MAP**. Cách chạy như sau:

**Bước 1:** nhập lệnh này vào terminal
```bash
set DATA_PROFILE=eval #sử dụng data đánh giá riêng
uvicorn src.backend.main:app --port 8001 #sử dụng cổng backend riêng
```

**Bước 2:** Sau khi kết nối API thành công -> mở `evaluate/evaluate_module5.ipynb` và chạy toàn bộ cell. Notebook sẽ gọi API tại cổng 8001, in bảng kết quả từng truy vấn và tổng hợp các chỉ số.

**Lưu ý:**
- Backend eval(đánh giá hệ thống) (8001) và backend prod(hệ thống) (8000) có thể chạy song song ở 2 terminal mà không ảnh hưởng.
- Terminal nào đã `set DATA_PROFILE=eval` thì đừng dùng để chạy `run_pipeline.bat` hay backend chính.

---

## 6. Cấu trúc project

```
|--- data/
│   |--- raw/                  # Dataset 50k (.jsonl) - profile prod
│   |--- vector/               # Vector DB 50k - profile prod
│   |--- eval/
│       |--- raw/              # Dataset đánh giá (.json) - profile eval
│       |--- vector/           # Vector DB đánh giá - profile eval
|--- wiki_bot/                 # Scrapy crawler (wiki_spider)
|--- src/
│   |--- backend/              # FastAPI + SearchService + scoring
│   |--- frontend/             # Giao diện web
│   |--- indexing/             # build_vector_db (chunking + embedding)
|--- evaluate/                 # File notebook đánh giá và kết quả
|--- run_pipeline.bat          # Pipeline tự động: crawl 50k + embedding
|--- requirements.txt
```