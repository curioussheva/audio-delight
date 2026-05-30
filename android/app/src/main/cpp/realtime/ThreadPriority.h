#pragma once
#include <pthread.h>

inline bool setRealtimePriority(pthread_t thread, int policy = SCHED_FIFO, int priority = 90) {
    sched_param param;
    param.sched_priority = priority;
    return pthread_setschedparam(thread, policy, &param) == 0;
}

inline bool setThreadAffinity(pthread_t thread, int coreId) {
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    CPU_SET(coreId, &cpuset);
    return pthread_setaffinity_np(thread, sizeof(cpu_set_t), &cpuset) == 0;
}