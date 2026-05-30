#pragma once

#include <string>
#include <vector>

namespace pristine {

class IRLoader {
public:

    static std::vector<float>
    loadWavMono(
        const std::string& path
    );
};

} // namespace pristine