/**
 * Error HTTP dengan status code — dilempar dari service/route dan diterjemahkan
 * menjadi respons JSON oleh error middleware.
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string) {
    return new ApiError(400, message);
  }

  static notFound(message = 'Data tidak ditemukan') {
    return new ApiError(404, message);
  }

  static conflict(message: string) {
    return new ApiError(409, message);
  }

  /**
   * Server yang salah, bukan permintaannya — mis. konfigurasi yang belum
   * lengkap. Pesannya tetap ditulis untuk dibaca manusia dan TIDAK PERNAH
   * memuat rahasia; yang boleh disebut hanya nama variabel/langkahnya.
   */
  static internal(message = 'Terjadi kesalahan pada server') {
    return new ApiError(500, message);
  }
}
