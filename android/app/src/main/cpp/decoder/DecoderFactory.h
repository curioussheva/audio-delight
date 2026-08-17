#pragma once

#include "AudioDecoder.h"

#include <functional>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

namespace pristine::decoder {

// =====================================================
// DECODER FACTORY
// =====================================================

class DecoderFactory {
public:
    using DecoderCreator =
        std::function<
            std::unique_ptr<AudioDecoder>(
                const DecodeConfig&
            )
        >;

    DecoderFactory();
    ~DecoderFactory() = default;

    DecoderFactory(const DecoderFactory&) = delete;
    DecoderFactory& operator=(const DecoderFactory&) = delete;

    // =============================================
    // Creation
    // =============================================

    [[nodiscard]]
    std::unique_ptr<AudioDecoder>
    createDecoder(
        const std::string& uri,
        const DecodeConfig& config = {}
    ) const;

    [[nodiscard]]
    std::unique_ptr<AudioDecoder>
    createDecoderForFormat(
        const std::string& format,
        const DecodeConfig& config = {}
    ) const;

    // =============================================
    // Registry
    // =============================================

    void registerDecoder(
        const std::string& format,
        DecoderCreator creator
    );

    // =============================================
    // Query
    // =============================================

    [[nodiscard]]
    bool isFormatSupported(
        const std::string& uri
    ) const;

    [[nodiscard]]
    std::vector<std::string>
    getSupportedFormats() const;

private:
    std::unordered_map<
        std::string,
        DecoderCreator
    > registry_;

    [[nodiscard]]
    std::string detectFormat(
        const std::string& uri
    ) const;

    [[nodiscard]]
    std::string getExtension(
        const std::string& uri
    ) const;
};

} // namespace pristine::decoder