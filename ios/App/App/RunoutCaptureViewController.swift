import UIKit
import AVFoundation

// Full-screen runout capture for the iOS shell. Live preview with a guide ring,
// then one shutter press takes three full-resolution stills at three torch
// levels, each cropped to the label and the ring around it, and hands them
// back to the web app, which keeps the sharpest. UNTESTED on a device.
final class RunoutCaptureViewController: UIViewController, AVCapturePhotoCaptureDelegate {
    var onFinish: (([Data]) -> Void)?
    var onCancel: (() -> Void)?

    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private let sessionQueue = DispatchQueue(label: "wd.runout.session")
    private var device: AVCaptureDevice?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private let guideLayer = CAShapeLayer()
    private let shutter = UIButton(type: .custom)
    private let cancelButton = UIButton(type: .system)
    private let hint = UILabel()

    private let levels: [Float] = [0.35, 0.7, 1.0]
    private let outputPx: CGFloat = 2400
    private var shots: [Data] = []
    private var pending: ((Data?) -> Void)?
    private var capturing = false
    private var finished = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        view.layer.addSublayer(preview)
        previewLayer = preview

        guideLayer.fillColor = UIColor.clear.cgColor
        guideLayer.strokeColor = UIColor(red: 0.79, green: 0.64, blue: 0.15, alpha: 0.9).cgColor
        guideLayer.lineWidth = 2
        view.layer.addSublayer(guideLayer)

        hint.text = "Fill the ring with the label. Tap to take three shots."
        hint.textColor = .white
        hint.font = .systemFont(ofSize: 14, weight: .medium)
        hint.textAlignment = .center
        hint.numberOfLines = 2
        view.addSubview(hint)

        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.setTitleColor(UIColor(white: 0.8, alpha: 1), for: .normal)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        view.addSubview(cancelButton)

        shutter.backgroundColor = .white
        shutter.layer.borderColor = UIColor(red: 0.79, green: 0.64, blue: 0.15, alpha: 1).cgColor
        shutter.layer.borderWidth = 5
        shutter.addTarget(self, action: #selector(shutterTapped), for: .touchUpInside)
        view.addSubview(shutter)

        sessionQueue.async { self.configureSession() }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
        let side = min(view.bounds.width, view.bounds.height) * 0.84
        let center = CGPoint(x: view.bounds.midX, y: view.bounds.midY - 20)
        guideLayer.path = UIBezierPath(arcCenter: center, radius: side / 2, startAngle: 0, endAngle: .pi * 2, clockwise: true).cgPath
        hint.frame = CGRect(x: 24, y: view.safeAreaInsets.top + 60, width: view.bounds.width - 48, height: 44)
        cancelButton.frame = CGRect(x: 16, y: view.safeAreaInsets.top + 12, width: 80, height: 40)
        shutter.frame = CGRect(x: view.bounds.midX - 36, y: view.bounds.height - view.safeAreaInsets.bottom - 110, width: 72, height: 72)
        shutter.layer.cornerRadius = 36
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        sessionQueue.async { self.stopEverything() }
    }

    // MARK: - Session

    private func configureSession() {
        session.beginConfiguration()
        session.sessionPreset = .photo
        guard let dev = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: dev),
              session.canAddInput(input), session.canAddOutput(photoOutput) else {
            session.commitConfiguration()
            finish(cancelled: true)
            return
        }
        session.addInput(input)
        session.addOutput(photoOutput)
        session.commitConfiguration()
        device = dev
        session.startRunning()

        try? dev.lockForConfiguration()
        if dev.isFocusModeSupported(.continuousAutoFocus) { dev.focusMode = .continuousAutoFocus }
        dev.unlockForConfiguration()

        // Light on for framing; each shot sets its own level.
        setTorch(on: true, level: levels[0])
    }

    private func stopEverything() {
        setTorch(on: false, level: 0)
        if session.isRunning { session.stopRunning() }
    }

    private func setTorch(on: Bool, level: Float) {
        guard let dev = device, dev.hasTorch else { return }
        do {
            try dev.lockForConfiguration()
            defer { dev.unlockForConfiguration() }
            if on {
                try dev.setTorchModeOn(level: min(max(level, 0.05), AVCaptureDevice.maxAvailableTorchLevel))
            } else {
                dev.torchMode = .off
            }
        } catch {
            // Torch is best-effort; the shot still goes ahead without it.
        }
    }

    // MARK: - Capture

    @objc private func shutterTapped() {
        guard !capturing, !finished, device != nil else { return }
        capturing = true
        shutter.isEnabled = false
        shots = []
        captureNext(index: 0)
    }

    private func captureNext(index: Int) {
        guard index < levels.count else {
            finish(cancelled: false)
            return
        }
        DispatchQueue.main.async { self.hint.text = "Shot \(index + 1) of \(self.levels.count)…" }
        sessionQueue.async {
            self.setTorch(on: true, level: self.levels[index])
            // Give the sensor a moment to settle at the new light level.
            self.sessionQueue.asyncAfter(deadline: .now() + 0.45) {
                let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
                settings.flashMode = .off
                self.pending = { data in
                    if let data = data { self.shots.append(data) }
                    self.captureNext(index: index + 1)
                }
                self.photoOutput.capturePhoto(with: settings, delegate: self)
            }
        }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        var processed: Data? = nil
        if error == nil, let raw = photo.fileDataRepresentation() {
            processed = cropToRunout(raw)
        }
        let callback = pending
        pending = nil
        callback?(processed)
    }

    // Centre-crop to a square and scale to outputPx, so each shot is about the
    // size the web app already uses, and the bridge carries less data.
    private func cropToRunout(_ data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let side = min(image.size.width, image.size.height)
        let scale = outputPx / side
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: outputPx, height: outputPx), format: format)
        let out = renderer.image { _ in
            let rect = CGRect(
                x: outputPx / 2 - (image.size.width / 2) * scale,
                y: outputPx / 2 - (image.size.height / 2) * scale,
                width: image.size.width * scale,
                height: image.size.height * scale
            )
            image.draw(in: rect)
        }
        return out.jpegData(compressionQuality: 0.9)
    }

    // MARK: - Finish

    private func finish(cancelled: Bool) {
        guard !finished else { return }
        finished = true
        sessionQueue.async { self.stopEverything() }
        let result = shots
        DispatchQueue.main.async {
            self.dismiss(animated: true) {
                if cancelled || result.isEmpty {
                    self.onCancel?()
                } else {
                    self.onFinish?(result)
                }
            }
        }
    }

    @objc private func cancelTapped() {
        finish(cancelled: true)
    }
}
