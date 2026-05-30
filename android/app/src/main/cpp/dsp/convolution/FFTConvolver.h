#pragma once

namespace pristine {

class FFTConvolver {
public:

    void prepare(
        int fftSize
    );

    void reset();

private:

    int mFFTSize = 0;
};

} // namespace pristine