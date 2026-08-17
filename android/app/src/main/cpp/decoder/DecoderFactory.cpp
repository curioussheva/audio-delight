#include "DecoderFactory.h"

#include "FFmpegDecoder.h"
#include "PCMDecoder.h"

#include <algorithm>

namespace pristine::decoder {

DecoderFactory::DecoderFactory() {

    registerDecoder(
        "mp3",
        [](const DecodeConfig& config) {
            return std::make_unique<FFmpegDecoder>(config);
        });

    registerDecoder(
        "aac",
        [](const DecodeConfig& config) {
            return std::make_unique<FFmpegDecoder>(config);
        });

    registerDecoder(
        "m4a",
        [](const DecodeConfig& config) {
            return std::make_unique<FFmpegDecoder>(config);
        });

    registerDecoder(
        "flac",
        [](const DecodeConfig& config) {
            return std::make_unique<FFmpegDecoder>(config);
        });

    registerDecoder(
        "ogg",
        [](const DecodeConfig& config) {
            return std::make_unique<FFmpegDecoder>(config);
        });

    registerDecoder(
        "opus",
        [](const DecodeConfig& config) {
            return std::make_unique<FFmpegDecoder>(config);
        });

    registerDecoder(
        "wav",
        [](const DecodeConfig& config) {
            return std::make_unique<PCMDecoder>(config);
        });

    registerDecoder(
        "aiff",
        [](const DecodeConfig& config) {
            return std::make_unique<PCMDecoder>(config);
        });
}

std::unique_ptr<AudioDecoder>
DecoderFactory::createDecoder(
    const std::string& uri,
    const DecodeConfig& config
) const {

    return createDecoderForFormat(
        detectFormat(uri),
        config);
}

std::unique_ptr<AudioDecoder>
DecoderFactory::createDecoderForFormat(
    const std::string& format,
    const DecodeConfig& config
) const {

    auto it = registry_.find(format);

    if (it == registry_.end()) {
        return nullptr;
    }

    return it->second(config);
}

void DecoderFactory::registerDecoder(
    const std::string& format,
    DecoderCreator creator
) {
    registry_[format] =
        std::move(creator);
}

bool DecoderFactory::isFormatSupported(
    const std::string& uri
) const {
    return registry_.contains(
        detectFormat(uri));
}

std::vector<std::string>
DecoderFactory::getSupportedFormats() const {

    std::vector<std::string> result;

    result.reserve(
        registry_.size());

    for (const auto& [format, _] : registry_) {
        result.push_back(format);
    }

    return result;
}

std::string DecoderFactory::detectFormat(
    const std::string& uri
) const {
    return getExtension(uri);
}

std::string DecoderFactory::getExtension(
    const std::string& uri
) const {

    auto pos =
        uri.find_last_of('.');

    if (pos == std::string::npos) {
        return {};
    }

    std::string ext =
        uri.substr(pos + 1);

    std::transform(
        ext.begin(),
        ext.end(),
        ext.begin(),
        [](unsigned char c) {
            return static_cast<char>(
                std::tolower(c));
        });

    return ext;
}

} // namespace pristine::decoder