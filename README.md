# FINAL PROJECT SEG301

## Cài đặt thư viện
`pip install -r requirements.txt`

## Lấy dữ liệu:
data/raw/ : `https://drive.google.com/drive/folders/1XXxsdiq8Z5xtVhfn3lMfn0Ymg8o4FHq4?usp=sharing`
data/vector: Chạy lệnh sau để bắt đầu indexing(mất khoảng 1-2p): `python -m src.indexing.build_vector_db`

## Chạy backend API
- khởi động backend: `uvicorn src.backend.main:app --reload`
- Truy cập vào địa chỉ này để kiểm tra đã kết nối API thành công chưa: `http://127.0.0.1:8000`
- Truy cập vào địa chỉ này để sử dụng giao diện: `http://127.0.0.1:8000/docs`

## Hướng dẫn sử dụng giao diện:
- Chọn mục "GET /search Search Wiki" trong phần defualt
- Nhấp vào ô "Try it out" bên góc phải cùng hàng với "Paramaters"
- Sau đó nhập keyword vào ô "Retrieval finding sentence" sau đó nhấn vào nút execute để truy vấn
- (Nếu muốn) tinh chỉnh số lượng bài viết trả về thì hãy thay đổi số k
- Kết quả được hiển thị ngay bên trong hộp Response và bên dưới 2 mục Curl và Request URL